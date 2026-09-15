/** Source-only checks. No target rig, retargeter, or gameplay simulation is used. */
import fs from "node:fs";
import { Matrix4, Quaternion, Vector3 } from "three";

const source = JSON.parse(
  fs.readFileSync(new URL("source-samples.json", import.meta.url)),
);
const joint = (name) => source.joints.findIndex((value) => value.name === name);
const position = (frame, name) =>
  new Vector3().fromArray(frame.positions, joint(name) * 3);
const rotation = (frame, name) =>
  new Quaternion().fromArray(frame.rotations, joint(name) * 4).normalize();
const degrees = 180 / Math.PI;
const rounded = (value) => +value.toFixed(6);
const range = (values) =>
  [Math.min(...values), Math.max(...values)].map(rounded);
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const knee = (frame, side) =>
  180 -
  position(frame, `${side}Thigh`)
    .sub(position(frame, `${side}Shin`))
    .angleTo(
      position(frame, `${side}Ankle`).sub(position(frame, `${side}Shin`)),
    ) *
    degrees;

// Preserve original skin influences, including the authored heel/shin blend.
// Using only toe-joint height would miss the heel strike and foot-roll interval.
const bytes = fs.readFileSync(
  new URL("Rig_Medium_MovementBasic.glb", import.meta.url),
);
const jsonLength = bytes.readUInt32LE(12);
const document = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binary = bytes.subarray(28 + jsonLength);
function accessor(index) {
  const value = document.accessors[index];
  const view = document.bufferViews[value.bufferView];
  if (value.sparse) throw new Error("Sparse source accessor is unsupported");
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[value.type];
  const [size, read] = {
    5121: [1, "readUInt8"],
    5123: [2, "readUInt16LE"],
    5126: [4, "readFloatLE"],
  }[value.componentType];
  const offset = (view.byteOffset ?? 0) + (value.byteOffset ?? 0);
  const stride = view.byteStride ?? width * size;
  return Array.from({ length: value.count }, (_, i) =>
    Array.from({ length: width }, (_, j) =>
      binary[read](offset + stride * i + size * j),
    ),
  );
}
const skin = document.skins[0];
const inverseBind = accessor(skin.inverseBindMatrices).map((values) =>
  new Matrix4().fromArray(values),
);
const skinNames = skin.joints.map((index) => document.nodes[index].name);
const sourceToSemantic = new Map(
  source.joints
    .filter((value) => !value.aliasOf)
    .map((value) => [value.sourceName, value.name]),
);
const soles = Object.fromEntries(
  ["left", "right"].map((side) => {
    const name = `Mannequin_Leg${side === "left" ? "Left" : "Right"}`;
    const mesh = document.meshes.find((value) => value.name === name);
    const primitive = mesh.primitives[0];
    const positions = accessor(primitive.attributes.POSITION);
    const joints = accessor(primitive.attributes.JOINTS_0);
    const weights = accessor(primitive.attributes.WEIGHTS_0);
    const selected = positions.flatMap((point, i) =>
      point[1] <= 0.005
        ? [
            {
              rest: point,
              influences: weights[i].flatMap((weight, j) =>
                weight > 0
                  ? [
                      {
                        weight,
                        joint: sourceToSemantic.get(skinNames[joints[i][j]]),
                        local: new Vector3()
                          .fromArray(point)
                          .applyMatrix4(inverseBind[joints[i][j]])
                          .toArray(),
                      },
                    ]
                  : [],
              ),
            },
          ]
        : [],
    );
    const minZ = Math.min(...selected.map((value) => value.rest[2]));
    const maxZ = Math.max(...selected.map((value) => value.rest[2]));
    for (const vertex of selected) {
      vertex.heel = vertex.rest[2] <= minZ + (maxZ - minZ) / 3;
      if (vertex.influences.some((value) => !value.joint))
        throw new Error("Missing sole influence semantic");
    }
    return [side, selected];
  }),
);
function solePoints(frame, side) {
  return soles[side].map((vertex) => ({
    heel: vertex.heel,
    position: vertex.influences.reduce(
      (out, influence) =>
        out.add(
          new Vector3()
            .fromArray(influence.local)
            .applyQuaternion(rotation(frame, influence.joint))
            .add(position(frame, influence.joint))
            .multiplyScalar(influence.weight),
        ),
      new Vector3(),
    ),
  }));
}
const bindError = Math.max(
  ...["left", "right"].flatMap((side) =>
    solePoints(source.rest, side).map((vertex, i) =>
      vertex.position.distanceTo(new Vector3().fromArray(soles[side][i].rest)),
    ),
  ),
);
if (bindError > 1e-5)
  throw new Error(
    `Source unit-scale reconstruction error ${bindError} exceeds 10 micrometres`,
  );

function interpolate(clip, time) {
  let index = clip.samples.findIndex((frame) => frame.time >= time);
  if (index <= 0) return clip.samples[index < 0 ? clip.samples.length - 1 : 0];
  const a = clip.samples[index - 1],
    b = clip.samples[index];
  const alpha = (time - a.time) / (b.time - a.time);
  return {
    positions: a.positions.map(
      (value, i) => value + (b.positions[i] - value) * alpha,
    ),
    rotations: source.joints.flatMap((value) =>
      rotation(a, value.name).slerp(rotation(b, value.name), alpha).toArray(),
    ),
  };
}
const report = {
  schema: 1,
  methodology: {
    frame: source.frame,
    kneeFlexion:
      "180 degrees minus the angle thigh-to-shin versus ankle-to-shin; 0 is straight.",
    torsoTilt:
      "Sagittal angle of the hips-to-head line from +Y; positive leans toward +Z.",
    continuity:
      "Largest world-quaternion step on a 60 Hz grid at playback 1.0. Source world quaternions are slerped between original 30 Hz samples; no target IK is involved.",
    contact:
      "Original mannequin vertices at bind Y <= 5 mm; heel is the rear third in bind +Z. Original inverse binds and skin weights are preserved. Low-sole/heel phases are within 15 mm of the clip-wide minimum sole height. This is a geometric proximity estimate, not authored contact metadata.",
    skinPrecision:
      "Samples preserve rigid world transforms. Source scale differs from unity by <4e-6; reconstruction is checked against the actual rest mesh within 10 micrometres.",
    pace: "Median toe-joint velocity during low-toe intervals. Diagnostic only: target pace must be calibrated after retargeting with target leg lengths and shoe contact geometry.",
  },
  rest: {
    leftLegLengthMetres: rounded(
      position(source.rest, "leftThigh").distanceTo(
        position(source.rest, "leftShin"),
      ) +
        position(source.rest, "leftShin").distanceTo(
          position(source.rest, "leftAnkle"),
        ),
    ),
    hipsHeightMetres: position(source.rest, "pelvis").y,
    headJointHeightMetres: position(source.rest, "head").y,
    soleReconstructionMaxErrorMetres: bindError,
    soleVertices: Object.fromEntries(
      Object.entries(soles).map(([side, vertices]) => [side, vertices.length]),
    ),
  },
  clips: {},
};
for (const [name, clip] of Object.entries(source.clips)) {
  if (name === "T-Pose") continue;
  const frames = clip.samples.slice(0, -1);
  const frameCount = Math.round(clip.duration * 60);
  const continuous = Array.from({ length: frameCount + 1 }, (_, i) =>
    interpolate(clip, (i * clip.duration) / frameCount),
  );
  const boneSteps = Object.fromEntries(
    [
      "leftThigh",
      "leftShin",
      "leftAnkle",
      "leftToe",
      "rightThigh",
      "rightShin",
      "rightAnkle",
      "rightToe",
    ].map((bone) => [
      bone,
      rounded(
        Math.max(
          ...continuous
            .slice(1)
            .map(
              (frame, i) =>
                rotation(frame, bone).angleTo(rotation(continuous[i], bone)) *
                degrees,
            ),
        ),
      ),
    ]),
  );
  const supportRows = frames.map((frame) => ({
    phase: rounded(frame.time / clip.duration),
    ...Object.fromEntries(
      ["left", "right"].map((side) => {
        const points = solePoints(frame, side);
        return [
          side,
          {
            soleY: rounded(
              Math.min(...points.map((point) => point.position.y)),
            ),
            heelY: rounded(
              Math.min(
                ...points
                  .filter((point) => point.heel)
                  .map((point) => point.position.y),
              ),
            ),
          },
        ];
      }),
    ),
  }));
  const soleFloor = Math.min(
    ...supportRows.flatMap((row) => [row.left.soleY, row.right.soleY]),
  );
  const toeFloor = Math.min(
    ...frames.flatMap((frame) => [
      position(frame, "leftToe").y,
      position(frame, "rightToe").y,
    ]),
  );
  const lowToe = frames.flatMap((frame, i) =>
    ["left", "right"].flatMap((side) => {
      if (position(frame, `${side}Toe`).y > toeFloor + 0.015) return [];
      const prev = frames[(i + frames.length - 1) % frames.length];
      const next = frames[(i + 1) % frames.length];
      return [
        {
          side,
          phase: rounded(frame.time / clip.duration),
          velocity: position(next, `${side}Toe`)
            .sub(position(prev, `${side}Toe`))
            .multiplyScalar(15)
            .toArray(),
        },
      ];
    }),
  );
  report.clips[name] = {
    duration: clip.duration,
    kneeFlexionDegrees: range(
      frames.flatMap((frame) =>
        ["left", "right"].map(
          (side) =>
            180 -
            position(frame, `${side}Thigh`)
              .sub(position(frame, `${side}Shin`))
              .angleTo(
                position(frame, `${side}Ankle`).sub(
                  position(frame, `${side}Shin`),
                ),
              ) *
              degrees,
        ),
      ),
    ),
    perLegKneeFlexionDegrees: Object.fromEntries(
      ["left", "right"].map((side) => [
        side,
        range(frames.map((frame) => knee(frame, side))),
      ]),
    ),
    maximumExtensionPhases: Object.fromEntries(
      ["left", "right"].map((side) => {
        const minimum = Math.min(...frames.map((frame) => knee(frame, side)));
        return [
          side,
          frames
            .filter((frame) => knee(frame, side) <= minimum + 1)
            .map((frame) => rounded(frame.time / clip.duration)),
        ];
      }),
    ),
    torsoTiltDegrees: range(
      frames.map((frame) => {
        const offset = position(frame, "head").sub(position(frame, "pelvis"));
        return Math.atan2(offset.z, offset.y) * degrees;
      }),
    ),
    hipsHeightMetres: range(frames.map((frame) => position(frame, "pelvis").y)),
    leftMinusRightKneeXMetres: range(
      frames.map(
        (frame) =>
          position(frame, "leftShin").x - position(frame, "rightShin").x,
      ),
    ),
    loopMaxJointPositionSeamMetres: Math.max(
      ...source.joints.map((value) =>
        position(clip.samples[0], value.name).distanceTo(
          position(clip.samples.at(-1), value.name),
        ),
      ),
    ),
    rootTravelMetres: position(clip.samples[0], "root").distanceTo(
      position(clip.samples.at(-1), "root"),
    ),
    maxWorldBoneStepAt60HzDegrees: boneSteps,
    sourceSoleFloorMetres: soleFloor,
    lowSolePhases: Object.fromEntries(
      ["left", "right"].map((side) => [
        side,
        supportRows
          .filter((row) => row[side].soleY <= soleFloor + 0.015)
          .map((row) => row.phase),
      ]),
    ),
    lowHeelPhases: Object.fromEntries(
      ["left", "right"].map((side) => [
        side,
        supportRows
          .filter((row) => row[side].heelY <= soleFloor + 0.015)
          .map((row) => row.phase),
      ]),
    ),
    lowToePhases: Object.fromEntries(
      ["left", "right"].map((side) => [
        side,
        lowToe.filter((row) => row.side === side).map((row) => row.phase),
      ]),
    ),
    lowToeMedianVelocityMetresPerSecond: [0, 1, 2].map((axis) =>
      rounded(median(lowToe.map((row) => row.velocity[axis]))),
    ),
    soleHeightSamples: supportRows,
  };
}
// Compare the complete left/right flexion waveforms; useful evidence when a
// toe-contact offset causes permanently bent diagonal blends. This is not a
// target rig test and cannot establish ground-contact quality on its own.
const curves = Object.fromEntries(
  Object.entries(source.clips)
    .filter(([name]) => name !== "T-Pose")
    .map(([name, clip]) => [
      name,
      clip.samples
        .slice(0, -1)
        .map((frame) => [knee(frame, "left"), knee(frame, "right")]),
    ]),
);
function curveAt(name, phase) {
  const curve = curves[name],
    frame = (((phase % 1) + 1) % 1) * curve.length;
  const index = Math.floor(frame),
    alpha = frame - index;
  return curve[index].map(
    (value, side) =>
      value * (1 - alpha) + curve[(index + 1) % curve.length][side] * alpha,
  );
}
function align(reference, referenceOffset, name, reverse = false) {
  let best = { rmsKneeDifferenceDegrees: Infinity, offset: 0 };
  for (let candidate = 0; candidate < 192; candidate++) {
    let error = 0;
    for (let sample = 0; sample < 192; sample++) {
      const a = curveAt(reference, sample / 192 + referenceOffset);
      const b = curveAt(
        name,
        candidate / 192 + (sample / 192) * (reverse ? -1 : 1),
      );
      error += a.reduce((sum, value, side) => sum + (value - b[side]) ** 2, 0);
    }
    const rms = Math.sqrt(error / 384);
    if (rms < best.rmsKneeDifferenceDegrees)
      best = { rmsKneeDifferenceDegrees: rms, offset: candidate / 192 };
  }
  return {
    reference,
    referenceOffset,
    clip: name,
    formula: reverse ? "offset - phase" : "offset + phase",
    ...best,
  };
}
report.posePhaseAlignment = {
  method:
    "Minimum RMS of both knee-flexion curves over 192 normalized phases, searching 192 cyclic offsets. Not a contact-event or target-geometry acceptance test.",
  forwardReference: [
    "Walking_Backwards",
    "Running_A",
    "Running_Strafe_Left",
    "Running_Strafe_Right",
  ].map((name) => align("Walking_B", 0.125, name)),
  reverseRun: align("Walking_Backwards", 0.625, "Running_A", true),
};
fs.writeFileSync(
  new URL("source-contact-measurements.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      rest: report.rest,
      clips: Object.fromEntries(
        Object.entries(report.clips).map(([name, clip]) => [
          name,
          {
            knees: clip.kneeFlexionDegrees,
            torso: clip.torsoTiltDegrees,
            maxStep60: Math.max(
              ...Object.values(clip.maxWorldBoneStepAt60HzDegrees),
            ),
            soleFloor: clip.sourceSoleFloorMetres,
            lowLeftHeel: clip.lowHeelPhases.left,
            lowLeftSole: clip.lowSolePhases.left,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
