/** Bake reusable performances from unchanged CC0 source TRS samples.
 * Uses the same rest-vector calibration and coordinate reflection as locomotion.
 * Equipment clips uniformly retime/reverse an authored pickup; no pose curves
 * are invented here. Per-item hand fitting belongs to the runtime.
 */
import fs from "node:fs/promises";
import { Quaternion, Vector3 } from "three";
const samples = JSON.parse(
  await fs.readFile(
    new URL(
      "../assets/source/performances/source-samples.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const catalog = JSON.parse(
  await fs.readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const sockets = new Map(catalog.rig.sockets.map((s) => [s.id, s]));
const bind = (name) => new Vector3(...sockets.get(name).position);
const bones = [
  ["hips", "pelvis", null],
  ["chest", "chest", "hips"],
  ["head", "head", "chest"],
  ...["left", "right"].flatMap((side) => {
    const s = side === "left" ? "L" : "R";
    return [
      [
        `arm_${s}`,
        `${side}UpperArm`,
        "chest",
        `${side}Forearm`,
        bind(`forearm_${s}`),
      ],
      [
        `forearm_${s}`,
        `${side}Forearm`,
        `arm_${s}`,
        `${side}Hand`,
        bind(`hand_${s}`),
      ],
      [
        `hand_${s}`,
        `${side}Hand`,
        `forearm_${s}`,
        `${side}Palm`,
        bind(`hand_${s}`),
      ],
      [`leg_${s}`, `${side}Thigh`, "hips", `${side}Shin`, bind(`shin_${s}`)],
      [
        `shin_${s}`,
        `${side}Shin`,
        `leg_${s}`,
        `${side}Ankle`,
        bind(`foot_${s}`),
      ],
      [`foot_${s}`, `${side}Ankle`, `shin_${s}`],
    ];
  }),
];

const selection = [
  {
    id: "wave",
    file: "Rig_Medium_Simulation.glb",
    clip: "Waving",
    loop: false,
  },
  {
    id: "cheer",
    file: "Rig_Medium_Simulation.glb",
    clip: "Cheering",
    loop: false,
  },
  { id: "dance", file: "UAL1_Standard.glb", clip: "Dance_Loop", loop: true },
  { id: "yes", file: "UAL2_Standard.glb", clip: "Yes", loop: false },
  { id: "no", file: "UAL2_Standard.glb", clip: "Idle_No_Loop", loop: false },
  {
    id: "equipOne",
    file: "Rig_Medium_General.glb",
    clip: "PickUp",
    duration: 0.8,
    equipment: "one",
    reverse: false,
  },
  {
    id: "stowOne",
    file: "Rig_Medium_General.glb",
    clip: "PickUp",
    duration: 0.8,
    equipment: "one",
    reverse: true,
  },
  {
    id: "equipTwo",
    file: "Rig_Medium_General.glb",
    clip: "PickUp",
    duration: 1.0,
    equipment: "two",
    reverse: false,
  },
  {
    id: "stowTwo",
    file: "Rig_Medium_General.glb",
    clip: "PickUp",
    duration: 1.0,
    equipment: "two",
    reverse: true,
  },
];
const round = (value) => {
  if (!Number.isFinite(value)) throw Error("Nonfinite performance retarget");
  return +value.toFixed(7);
};
const clips = {};
for (const selected of selection) {
  const source = samples.sources[selected.file];
  const clip = samples.clips[`${selected.file}:${selected.clip}`];
  const idx = (name) => {
    const index = source.joints.findIndex((joint) => joint.name === name);
    if (index < 0) throw new Error(`Missing ${name}`);
    return index;
  };
  const point = (frame, name) =>
    new Vector3()
      .fromArray(frame.positions, idx(name) * 3)
      .multiply(new Vector3(-1, 1, 1));
  const rotation = (frame, name) => {
    const q = new Quaternion().fromArray(frame.rotations, idx(name) * 4);
    return new Quaternion(q.x, -q.y, -q.z, q.w).normalize();
  };
  const rest = source.rest;
  const corrections = bones.map(([, name, , child, vector]) =>
    child
      ? new Quaternion().setFromUnitVectors(
          vector.clone().normalize(),
          point(rest, child).sub(point(rest, name)).normalize(),
        )
      : new Quaternion(),
  );
  const ratio =
    (bind("shin_L").length() + bind("foot_L").length()) /
    (point(rest, "leftShin").distanceTo(point(rest, "leftThigh")) +
      point(rest, "leftAnkle").distanceTo(point(rest, "leftShin")));
  const duration = selected.duration ?? clip.duration;
  const originalFrames = selected.reverse
    ? [...clip.samples].reverse()
    : clip.samples;
  const frames = originalFrames.map((frame) => {
    const worlds = new Map();
    const rotations = bones.flatMap(([id, name, parent], index) => {
      const world = rotation(frame, name)
        .multiply(rotation(rest, name).invert())
        .multiply(corrections[index]);
      worlds.set(id, world);
      return (
        parent ? worlds.get(parent).clone().invert().multiply(world) : world
      )
        .normalize()
        .toArray()
        .map(round);
    });
    // Preserve authored pelvis motion, calibrated to target limb length. Foot
    // grounding resolves support on the actual target footwear in the runtime.
    const root = point(frame, "pelvis")
      .sub(point(rest, "pelvis"))
      .multiplyScalar(ratio)
      .toArray()
      .map(round);
    // These selected gestures/pickups are grounded; they contain no jump event.
    return {
      time: round(
        ((selected.reverse ? clip.duration - frame.time : frame.time) /
          clip.duration) *
          duration,
      ),
      root,
      rotations,
      support: 0,
    };
  });
  const lowestReach = clip.samples.reduce((best, frame) =>
    point(frame, "rightHand").y < point(best, "rightHand").y ? frame : best,
  );
  const marker = selected.reverse
    ? 1 - lowestReach.time / clip.duration
    : lowestReach.time / clip.duration;
  clips[selected.id] = {
    duration: round(duration),
    loop: selected.loop ?? false,
    category: selected.equipment ? "equipment" : "emote",
    source: {
      file: selected.file,
      clip: selected.clip,
      rig: source.rig,
      duration: clip.duration,
      reverse: selected.reverse ?? false,
      adaptation: selected.equipment
        ? `${selected.reverse ? "Time-reversed" : "Forward"} authored right-hand pickup, uniformly retimed.${selected.equipment === "two" ? " Two-hand variant requires runtime secondary-hand IK and actual item clearance; the source clip is not a native two-hand draw." : " Mirroring for the opposite hand belongs to the runtime."}`
        : "Original authored motion and duration; rest-vector retarget only.",
    },
    markers: selected.equipment
      ? [
          {
            name: selected.reverse ? "release" : "grip",
            time: round(marker * duration),
            sourceTime: lowestReach.time,
          },
        ]
      : [],
    frames,
  };
}
await fs.writeFile(
  new URL("../src/performance-data.ts", import.meta.url),
  `// Generated by scripts/retarget-performances.mjs. KayKit and Quaternius CC0; source provenance in assets/source/performances.\n// prettier-ignore\nexport const performanceData = ${JSON.stringify({ bones: bones.map(([name]) => name), clips })};\n`,
);
console.log(
  Object.fromEntries(
    Object.entries(clips).map(([name, clip]) => [
      name,
      {
        duration: clip.duration,
        frames: clip.frames.length,
        markers: clip.markers,
      },
    ]),
  ),
);
