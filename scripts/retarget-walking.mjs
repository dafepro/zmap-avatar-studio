/** Bake CC0 Quaternius walking poses onto the catalog's bind vectors.
 * Walk_Loop receives a measured hip-swing adaptation below.
 * No directional ankle warping: the entire authored pose changes direction.
 */
import fs from "node:fs/promises";
import { Quaternion, Vector3 } from "three";
const sampled = JSON.parse(
  await fs.readFile(
    new URL(
      "../assets/source/locomotion/relaxed/source-samples.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const source = {
  ...sampled.sources["UAL1_Standard.glb"],
  clips: Object.fromEntries(
    Object.entries(sampled.clips).map(([key, value]) => [
      key.split(":")[1],
      value,
    ]),
  ),
};
for (const [key, rig] of Object.entries(sampled.sources)) {
  if (JSON.stringify(rig.rest) !== JSON.stringify(source.rest))
    throw Error(`Mismatched source rest: ${key}`);
}
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
const idx = (id) => {
  const i = source.joints.findIndex((j) => j.name === id);
  if (i < 0) throw Error(`Missing ${id}`);
  return i;
};
const point = (frame, id) =>
  new Vector3()
    .fromArray(frame.positions, idx(id) * 3)
    .multiply(new Vector3(-1, 1, 1));
const rotation = (frame, id) => {
  const q = new Quaternion().fromArray(frame.rotations, idx(id) * 4);
  return new Quaternion(q.x, -q.y, -q.z, q.w).normalize();
};
const rest = source.rest;
const corrections = bones.map(([, id, , child, vector]) =>
  child
    ? new Quaternion().setFromUnitVectors(
        vector.clone().normalize(),
        point(rest, child).sub(point(rest, id)).normalize(),
      )
    : new Quaternion(),
);
const ratio =
  (bind("shin_L").length() + bind("foot_L").length()) /
  (point(rest, "leftShin").distanceTo(point(rest, "leftThigh")) +
    point(rest, "leftAnkle").distanceTo(point(rest, "leftShin")));
const round = (n) => {
  if (!Number.isFinite(n)) throw Error("Nonfinite retarget");
  return Number(n.toFixed(7));
};
const clips = {};
const targetToe = (frame, side) => {
  const positions = new Map(),
    worlds = new Map();
  for (const socket of catalog.rig.sockets) {
    const parentQ = worlds.get(socket.parent) ?? new Quaternion();
    const p = bind(socket.id)
      .applyQuaternion(parentQ)
      .add(positions.get(socket.parent) ?? new Vector3().fromArray(frame.root));
    const i = bones.findIndex(([id]) => id === socket.id);
    const q =
      i < 0
        ? new Quaternion()
        : new Quaternion().fromArray(frame.rotations, i * 4);
    positions.set(socket.id, p);
    worlds.set(socket.id, parentQ.clone().multiply(q));
  }
  return new Vector3(0, -0.115, 0.2)
    .applyQuaternion(worlds.get(`foot_${side}`))
    .add(positions.get(`foot_${side}`));
};
for (const [name, direction] of [
  ["Walk_Loop", [0, 0, 1]],
  ["Walk_Formal_Loop", [0, 0, 1]],
  ["Walk_Carry_Loop", [0, 0, 1]],
]) {
  const clip = source.clips[name];
  const frames = clip.samples.map((frame) => {
    const worlds = new Map();
    const rotations = bones.flatMap(([id, sourceId, parent], i) => {
      const world = rotation(frame, sourceId)
        .multiply(rotation(rest, sourceId).invert())
        .multiply(corrections[i]);
      worlds.set(id, world);
      return (
        parent ? worlds.get(parent).clone().invert().multiply(world) : world
      )
        .normalize()
        .toArray()
        .map(round);
    });
    const root = point(frame, "pelvis")
      .sub(point(rest, "pelvis"))
      .multiplyScalar(ratio)
      .toArray()
      .map(round);
    // Walking has no flight phase. Target sole fitting determines support height.
    return { root, rotations, support: 0 };
  });
  // Adapt the regular walk's hip swing to the longer-legged target. Preserve
  // authored knee flexion and complete world ankle orientation. This expands
  // reach without high knees, limb scaling or a stiff rear knee. Contact pace
  // below is measured from the resulting target trajectory, not guessed.
  if (name === "Walk_Loop")
    for (const frame of frames) {
      const read = (id) =>
        new Quaternion().fromArray(
          frame.rotations,
          bones.findIndex(([b]) => b === id) * 4,
        );
      const write = (id, q) =>
        frame.rotations.splice(
          bones.findIndex(([b]) => b === id) * 4,
          4,
          ...q.normalize().toArray().map(round),
        );
      const hips = read("hips");
      for (const side of ["L", "R"]) {
        const leg = read(`leg_${side}`),
          shin = read(`shin_${side}`),
          foot = read(`foot_${side}`);
        const direction = new Vector3(0, -1, 0).applyQuaternion(
          hips.clone().multiply(leg),
        );
        const pitch = Math.atan2(direction.z, -direction.y);
        const turn = new Quaternion().setFromAxisAngle(
          new Vector3(1, 0, 0),
          -0.15 * pitch,
        );
        const adapted = hips
          .clone()
          .invert()
          .multiply(turn)
          .multiply(hips)
          .multiply(leg);
        const compensated = shin
          .clone()
          .invert()
          .multiply(adapted.clone().invert())
          .multiply(leg)
          .multiply(shin)
          .multiply(foot);
        write(`leg_${side}`, adapted);
        write(`foot_${side}`, compensated);
      }
    }
  frames[frames.length - 1] = structuredClone(frames[0]);
  // Measure pace AFTER retargeting: this model has longer shins relative to thighs.
  const pace = [];
  for (const [side, s] of [
    ["left", "L"],
    ["right", "R"],
  ]) {
    const ys = clip.samples.map((f) => point(f, `${side}Toe`).y),
      min = Math.min(...ys);
    for (let i = 1; i < frames.length - 1; i++)
      if (ys[i] < min + 0.015) {
        const v =
          targetToe(frames[i + 1], s)
            .sub(targetToe(frames[i - 1], s))
            .dot(new Vector3(...direction)) /
          ((2 * clip.duration) / (frames.length - 1));
        if (v < -0.15) pace.push(-v);
      }
  }
  pace.sort((a, b) => a - b);
  if (!pace.length) throw Error(`No contact pace for ${name}`);
  clips[name] = {
    duration: clip.duration,
    contactSpeed: round(pace[Math.floor(pace.length / 2)]),
    frames,
  };
}
await fs.writeFile(
  new URL("../src/walking-data.ts", import.meta.url),
  `// Generated by scripts/retarget-walking.mjs. Quaternius CC0; see docs/motion.md.\n// prettier-ignore\nexport const walkingData = ${JSON.stringify({ bones: bones.map(([name]) => name), clips })};\n`,
);
console.log(
  Object.fromEntries(
    Object.entries(clips).map(([name, c]) => [
      name,
      { duration: c.duration, contactSpeed: c.contactSpeed },
    ]),
  ),
);
