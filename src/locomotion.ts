import * as THREE from "three";
import { locomotionData as kaykitData } from "./locomotion-data.js";
import { walkingData } from "./walking-data.js";
const locomotionData = {
  bones: kaykitData.bones,
  clips: { ...kaykitData.clips, ...walkingData.clips },
};

export type LocomotionClip = keyof typeof locomotionData.clips;
export type ReferencePose = {
  root: THREE.Vector3;
  rotations: Map<string, THREE.Quaternion>;
  support: number;
};

/** The approved neutral rig pose also serves asset fitting/reduced-motion views. */
export function restingLocomotion(): ReferencePose {
  const rotations = new Map(
    locomotionData.bones.map((bone) => [bone, new THREE.Quaternion()]),
  );
  for (const [bone, x, z] of [
    ["arm_L", 0, -0.14],
    ["arm_R", 0, 0.14],
    ["forearm_L", -0.1, 0],
    ["forearm_R", -0.1, 0],
  ] as const)
    rotations.get(bone)!.setFromEuler(new THREE.Euler(x, 0, z));
  return { root: new THREE.Vector3(), rotations, support: 0 };
}

/** Immutable authored curves; all mutable sampling state belongs to an avatar. */
export function sampleLocomotion(
  clip: LocomotionClip,
  phase: number,
): ReferencePose {
  const frames = locomotionData.clips[clip].frames;
  const cursor = (((phase % 1) + 1) % 1) * (frames.length - 1);
  const lo = Math.floor(cursor),
    fraction = cursor - lo;
  const a = frames[lo],
    b = frames[lo + 1];
  return {
    support: THREE.MathUtils.lerp(a.support, b.support, fraction),
    root: new THREE.Vector3()
      .fromArray(a.root)
      .lerp(new THREE.Vector3().fromArray(b.root), fraction),
    rotations: new Map(
      locomotionData.bones.map((bone, i) => [
        bone,
        new THREE.Quaternion()
          .fromArray(a.rotations, i * 4)
          .normalize()
          .slerp(
            new THREE.Quaternion().fromArray(b.rotations, i * 4).normalize(),
            fraction,
          ),
      ]),
    ),
  };
}

// A symmetric five-key filter removes root/contact spikes without shifting
// phase. Keep rotation controls unfiltered to preserve knee extension; periodic
// cubic reconstruction smooths their velocity. The raw source stays auditable.
const playbackFrames = Object.fromEntries(
  Object.entries(locomotionData.clips).map(([id, clip]) => {
    const keys = clip.frames.slice(0, -1),
      n = keys.length,
      kernel = [1, 4, 6, 4, 1];
    return [
      id,
      keys.map((reference, i) => {
        const around = kernel.map((_, j) => keys[(i + j - 2 + n) % n]);
        const root = [0, 1, 2].map((axis) =>
          around.reduce(
            (sum, key, j) => sum + (key.root[axis] * kernel[j]) / 16,
            0,
          ),
        );
        const support = around.reduce(
          (sum, key, j) => sum + (key.support * kernel[j]) / 16,
          0,
        );
        const rotations = [...reference.rotations];
        return { root, support, rotations };
      }),
    ];
  }),
) as Record<
  LocomotionClip,
  { root: number[]; support: number; rotations: number[] }[]
>;

/** Periodic cubic pose reconstruction removes velocity breaks at baked sample
 * boundaries. Quaternion hemispheres are aligned before normalized blending. */
export function smoothLocomotion(
  clip: LocomotionClip,
  phase: number,
): ReferencePose {
  const frames = playbackFrames[clip],
    count = frames.length;
  const cursor = (((phase % 1) + 1) % 1) * count,
    index = Math.floor(cursor),
    t = cursor - index;
  const weights = [
    (1 - t) ** 3,
    3 * t ** 3 - 6 * t * t + 4,
    -3 * t ** 3 + 3 * t * t + 3 * t + 1,
    t ** 3,
  ].map((w) => w / 6);
  const keys = [-1, 0, 1, 2].map(
    (offset) => frames[(index + offset + count) % count],
  );
  const root = new THREE.Vector3();
  let support = 0;
  for (let i = 0; i < 4; i++) {
    root.addScaledVector(
      new THREE.Vector3().fromArray(keys[i].root),
      weights[i],
    );
    support += weights[i] * keys[i].support;
  }
  const rotations = new Map(
    locomotionData.bones.map((bone, b) => {
      const reference = new THREE.Quaternion().fromArray(
        keys[1].rotations,
        b * 4,
      );
      const sum = new THREE.Vector4(0, 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const q = new THREE.Quaternion().fromArray(keys[i].rotations, b * 4);
        const w = weights[i] * (q.dot(reference) < 0 ? -1 : 1);
        sum.addScaledVector(new THREE.Vector4(q.x, q.y, q.z, q.w), w);
      }
      return [
        bone,
        new THREE.Quaternion(sum.x, sum.y, sum.z, sum.w).normalize(),
      ] as const;
    }),
  );
  return { root, support, rotations };
}

export function mixLocomotion(
  a: ReferencePose,
  b: ReferencePose,
  weight: number,
): ReferencePose {
  a.root.lerp(b.root, weight);
  a.support = THREE.MathUtils.lerp(a.support, b.support, weight);
  for (const [bone, q] of a.rotations) q.slerp(b.rotations.get(bone)!, weight);
  return a;
}

/** Cardinal clips share a left-support phase. Blend entire poses so the knee,
 * ankle and hip remain a coherent chain through every direction, including -Z.
 * The archive has no backward sprint: reverse Running_A as a complete pose,
 * never turn just the ankles of a forward-running body. */
type Component = {
  clip: LocomotionClip;
  weight: number;
  offset: number;
  reverse?: boolean;
};
const wrap = (phase: number) => ((phase % 1) + 1) % 1;
export type DirectionWeights = {
  forward: number;
  back: number;
  left: number;
  right: number;
};
export function directionWeights(velocity: {
  x: number;
  z: number;
}): DirectionWeights {
  const total = Math.abs(velocity.x) + Math.abs(velocity.z);
  return {
    forward: total > 1e-7 ? Math.max(0, velocity.z) / total : 1,
    back: total > 1e-7 ? Math.max(0, -velocity.z) / total : 0,
    left: total > 1e-7 ? Math.max(0, -velocity.x) / total : 0,
    right: total > 1e-7 ? Math.max(0, velocity.x) / total : 0,
  };
}
// The relaxed reference retains its complete knee bend in either travel direction.
export function locomotionPace(
  speed: number,
  velocity = { x: 0, z: speed },
  weights = directionWeights(velocity),
) {
  const sprinting = THREE.MathUtils.smoothstep(speed, 2.6, 4.4);
  const lateralAmplitude = THREE.MathUtils.lerp(0.42, 1, sprinting);
  const { forward, back, left, right } = weights;
  const retreat = THREE.MathUtils.smoothstep(back, 0, 0.7);
  const retreatWeight = back + (left + right) * retreat;
  const components = (
    [
      { clip: "Walk_Loop", weight: forward * (1 - sprinting), offset: 0.125 },
      { clip: "Running_A", weight: forward * sprinting, offset: 0.104167 },
      {
        clip: "Walk_Loop",
        weight: retreatWeight * (1 - sprinting),
        offset: 0.375,
        reverse: true,
      },
      {
        clip: "Running_A",
        weight: retreatWeight * sprinting,
        offset: 0.395833,
        reverse: true,
      },
      {
        clip: "Running_Strafe_Left",
        weight: left * (1 - retreat),
        offset: 0.817708,
      },
      {
        clip: "Running_Strafe_Right",
        weight: right * (1 - retreat),
        offset: 0.817708,
      },
    ] satisfies Component[]
  ).filter((c) => c.weight > 0);
  const dominant = components.reduce((a, b) => (a.weight >= b.weight ? a : b));
  // Distance per cycle, measured from this rig rather than source height.
  const stride = components.reduce(
    (sum, c) =>
      sum +
      c.weight *
        locomotionData.clips[c.clip].contactSpeed *
        (c.clip.startsWith("Running_Strafe") ? lateralAmplitude : 1) *
        locomotionData.clips[c.clip].duration,
    0,
  );
  const frequency = Math.max(0.05, speed / stride);
  return {
    components,
    lateralAmplitude,
    sprinting,
    frequency,
    clip: dominant.clip,
    reversed: !!dominant.reverse,
    sourcePhase: (phase: number) =>
      wrap(dominant.offset + (dominant.reverse ? -phase : phase)),
    playbackRate: frequency * locomotionData.clips[dominant.clip].duration,
  };
}
export function movingLocomotion(
  speed: number,
  phase: number,
  velocity = { x: 0, z: speed },
  weights = directionWeights(velocity),
): ReferencePose {
  const { components, lateralAmplitude } = locomotionPace(
    speed,
    velocity,
    weights,
  );
  let contactEnvelope = Infinity;
  let pose: ReferencePose | undefined,
    weight = 0;
  for (const c of components) {
    let next = smoothLocomotion(
      c.clip,
      c.offset + (c.reverse ? -phase : phase),
    );
    // Slow lateral steps remain grounded; running gains a modest flight phase.
    if (c.clip.startsWith("Running_Strafe")) {
      next = mixLocomotion(restingLocomotion(), next, lateralAmplitude);
      next.support *= THREE.MathUtils.smoothstep(speed, 2.6, 4.4);
    }
    // A blended stance must still reach the ground: averaging two out-of-phase
    // flight curves otherwise makes diagonal running hover for the whole cycle.
    // The influence fades continuously as a contributing clip's weight vanishes.
    contactEnvelope = Math.min(
      contactEnvelope,
      next.support + 0.07 * (1 - c.weight) ** 6,
    );
    weight += c.weight;
    pose = pose ? mixLocomotion(pose, next, c.weight / weight) : next;
  }
  // Backward diagonals use the backward stride, oriented as one pelvis/leg
  // chain. Mixing a forward-moving strafe into a reversed run cancels the
  // longitudinal foot stroke. Keep the upper body in its authored aim frame.
  const retreat = THREE.MathUtils.smoothstep(weights.back, 0, 0.7);
  if (retreat > 0) {
    const yaw =
      THREE.MathUtils.clamp(
        Math.atan2(-velocity.x, -velocity.z),
        -Math.PI / 4,
        Math.PI / 4,
      ) * retreat;
    const turn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const hips = pose!.rotations.get("hips")!;
    const old = hips.clone();
    hips.premultiply(turn);
    pose!.rotations
      .get("chest")!
      .premultiply(
        old.clone().invert().multiply(turn.clone().invert()).multiply(old),
      );
    pose!.root.applyQuaternion(turn);
  }
  pose!.support = Math.min(pose!.support, contactEnvelope);
  return pose!;
}
