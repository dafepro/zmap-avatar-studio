/** Rebuild the compact runtime curves from the untouched CC0 reference samples.
 * Source: assets/source/locomotion/README.md. No hand-authored gait curves.
 */
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";

const source = JSON.parse(
  await fs.readFile(
    new URL("../assets/source/locomotion/source-samples.json", import.meta.url),
    "utf8",
  ),
);
// Each target has an identity bind rotation. Source left is +X; target left is -X.
const bones = [
  ["hips", "pelvis", null],
  ["chest", "chest", "hips"],
  ["head", "head", "chest"],
  ...["left", "right"].flatMap((side) => {
    const s = side === "left" ? "L" : "R",
      x = side === "left" ? -1 : 1;
    return [
      [
        `arm_${s}`,
        `${side}UpperArm`,
        "chest",
        `${side}Forearm`,
        [x * 0.065, -0.27, 0],
      ],
      [
        `forearm_${s}`,
        `${side}Forearm`,
        `arm_${s}`,
        `${side}Hand`,
        [x * 0.064, -0.217, 0.007],
      ],
      // The palm continues the forearm in the target bind pose.
      [
        `hand_${s}`,
        `${side}Hand`,
        `forearm_${s}`,
        `${side}Hand`,
        [x * 0.064, -0.217, 0.007],
        `${side}Forearm`,
      ],
      [
        `leg_${s}`,
        `${side}Thigh`,
        "hips",
        `${side}Shin`,
        [x * 0.06, -0.43, 0.013],
      ],
      [
        `shin_${s}`,
        `${side}Shin`,
        `leg_${s}`,
        `${side}Ankle`,
        [x * 0.055, -0.44, -0.003],
      ],
      [`foot_${s}`, `${side}Ankle`, `shin_${s}`],
    ];
  }),
];
const idx = (id) => source.joints.findIndex((joint) => joint.name === id);
const position = (frame, id) =>
  new Vector3()
    .fromArray(frame.positions, idx(id) * 3)
    .multiply(new Vector3(-1, 1, 1));
const rotation = (frame, id) => {
  const q = new Quaternion().fromArray(frame.rotations, idx(id) * 4);
  return new Quaternion(q.x, -q.y, -q.z, q.w).normalize();
};
const rest = source.rest;
const correction = bones.map(([, id, , child, vector, from]) =>
  child
    ? new Quaternion().setFromUnitVectors(
        new Vector3(...vector).normalize(),
        position(rest, child)
          .sub(position(rest, from ?? id))
          .normalize(),
      )
    : new Quaternion(),
);
// A single aim vector leaves palm roll unspecified. Calibrate the second axis
// from the author's thumb/metacarpal and the target's actual relaxed hand mesh.
const restFrames = JSON.parse(
  await fs.readFile(
    new URL(
      "../assets/source/locomotion/source-rest-frames.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const bindPoint = (name) =>
  new Vector3(
    ...restFrames.joints.find((j) => j.name === name).worldPosition,
  ).multiply(new Vector3(-1, 1, 1));
const palmFrame = (long, thumb) => {
  long.normalize();
  thumb.addScaledVector(long, -thumb.dot(long)).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(thumb, long, thumb.clone().cross(long).normalize()),
  );
};
for (const [suffix, sign] of [
  ["l", -1],
  ["r", 1],
]) {
  const wrist = bindPoint(`hand_${suffix}`);
  const sourcePalm = palmFrame(
    bindPoint(`middle_01_${suffix}`).sub(wrist),
    bindPoint(`thumb_01_${suffix}`).sub(wrist),
  );
  const targetPalm = palmFrame(
    new Vector3(sign * 0.023, -0.087, 0.003),
    new Vector3(-sign * 0.047, -0.041, 0.032),
  );
  correction[
    bones.findIndex(([name]) => name === `hand_${suffix.toUpperCase()}`)
  ] = sourcePalm.multiply(targetPalm.invert());
}
const round = (n) => Number(n.toFixed(7));
const clips = {};
for (const name of ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop"]) {
  const clip = source.clips[name];
  const frames = clip.samples.map((frame) => {
    const worlds = new Map();
    const rotations = bones.flatMap(([name, sourceName, parent], i) => {
      const world = rotation(frame, sourceName)
        .multiply(rotation(rest, sourceName).invert())
        .multiply(correction[i]);
      worlds.set(name, world);
      return (
        parent ? worlds.get(parent).clone().invert().multiply(world) : world
      )
        .normalize()
        .toArray()
        .map(round);
    });
    const root = position(frame, "pelvis")
      .sub(position(rest, "pelvis"))
      .multiplyScalar(0.8794 / 0.8298)
      .toArray()
      .map(round);
    const support =
      Math.max(
        0,
        Math.min(
          ...["left", "right"].flatMap((side) => {
            const ankle = position(frame, `${side}Ankle`);
            const delta = rotation(frame, `${side}Ankle`).multiply(
              rotation(rest, `${side}Ankle`).invert(),
            );
            const heel = new Vector3(0, -0.0885, -0.035)
              .applyQuaternion(delta)
              .add(ankle);
            return [heel.y - 0.0152, position(frame, `${side}Toe`).y - 0.0152];
          }),
        ),
      ) *
      (0.8794 / 0.8298);
    return { root, rotations, support: round(support) };
  });
  // Original jog/sprint/idle have a tiny hand seam. A closed endpoint lets slerp
  // interpolate the last authored key into the first without a visible snap.
  frames[frames.length - 1] = structuredClone(frames[0]);
  clips[name] = { duration: clip.duration, frames };
}
const output = new URL("../src/locomotion-data.ts", import.meta.url);
await fs.writeFile(
  output,
  `// Generated by scripts/retarget-locomotion.mjs. Quaternius CC0; see docs/motion.md.\n// prettier-ignore\nexport const locomotionData = ${JSON.stringify({ bones: bones.map(([name]) => name), clips })};\n`,
);
console.log(
  `Retargeted ${Object.keys(clips).join(", ")} -> ${fileURLToPath(output)}`,
);
