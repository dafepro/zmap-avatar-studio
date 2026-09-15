import * as THREE from "three";
import { locomotionData } from "./locomotion-data.js";

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
          .slerp(
            new THREE.Quaternion().fromArray(b.rotations, i * 4),
            fraction,
          ),
      ]),
    ),
  };
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

/** Physical speed drives pace, with a continuous walk/jog/sprint blend. Stride
 * warping below the pelvis accounts for our shorter limbs without speeding up
 * every upper-body gesture. Source contact speeds are measured in the audit. */
export function locomotionPace(speed: number) {
  const jogging = THREE.MathUtils.smoothstep(speed, 2.35, 3.45);
  const sprinting = THREE.MathUtils.smoothstep(speed, 4.25, 5.25);
  const walkRate = THREE.MathUtils.clamp(speed / 1.3, 0.3, 1.6);
  const jogRate = THREE.MathUtils.clamp(speed / 4.6, 0.7, 1.15);
  const sprintRate = THREE.MathUtils.clamp(speed / 6.1, 0.8, 1.25);
  const frequency = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(walkRate / 1.3333333, jogRate / 0.9333333, jogging),
    sprintRate / 0.6666667,
    sprinting,
  );
  const stride =
    THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.97938 * walkRate, 5.898 * jogRate, jogging),
      8.905 * sprintRate,
      sprinting,
    ) *
    (0.8794 / 0.8298);
  const clip: LocomotionClip =
    sprinting > 0.5
      ? "Sprint_Loop"
      : jogging > 0.5
        ? "Jog_Fwd_Loop"
        : "Walk_Loop";
  return {
    jogging,
    sprinting,
    frequency,
    strideScale: THREE.MathUtils.clamp(
      speed / Math.max(0.1, stride),
      0.3,
      1.65,
    ),
    clip,
    playbackRate: frequency * locomotionData.clips[clip].duration,
  };
}

export function movingLocomotion(speed: number, phase: number): ReferencePose {
  const pace = locomotionPace(speed);
  if (pace.sprinting === 1) return sampleLocomotion("Sprint_Loop", phase);
  const lower =
    pace.jogging === 1
      ? sampleLocomotion("Jog_Fwd_Loop", phase)
      : pace.jogging === 0
        ? sampleLocomotion("Walk_Loop", phase)
        : mixLocomotion(
            sampleLocomotion("Walk_Loop", phase),
            sampleLocomotion("Jog_Fwd_Loop", phase),
            pace.jogging,
          );
  return pace.sprinting === 0
    ? lower
    : mixLocomotion(
        lower,
        sampleLocomotion("Sprint_Loop", phase),
        pace.sprinting,
      );
}
