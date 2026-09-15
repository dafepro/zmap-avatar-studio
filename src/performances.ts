import * as THREE from "three";
import { performanceData } from "./performance-data.js";
import type { ReferencePose } from "./locomotion.js";
export type EmoteId = "wave" | "cheer" | "dance" | "yes" | "no";
export type EquipmentClip = "equipOne" | "stowOne" | "equipTwo" | "stowTwo";
export type PerformanceClip = EmoteId | EquipmentClip;
type Frame = {
  time: number;
  root: number[];
  rotations: number[];
  support: number;
};
type Clip = {
  duration: number;
  loop: boolean;
  markers: { name: string; time: number }[];
  frames: Frame[];
};
const data = performanceData as {
  bones: string[];
  clips: Record<PerformanceClip, Clip>;
};
export const emoteDescriptors = Object.freeze(
  (
    [
      ["wave", "Wave"],
      ["cheer", "Cheer"],
      ["dance", "Dance"],
      ["yes", "Yes"],
      ["no", "No"],
    ] as const
  ).map(([id, label]) =>
    Object.freeze({
      id,
      label,
      duration: data.clips[id].duration * (id === "dance" ? 3 : 1),
      loop: id === "dance",
    }),
  ),
);
export function isEmoteId(id: unknown): id is EmoteId {
  return emoteDescriptors.some((entry) => entry.id === id);
}
export function samplePerformance(
  id: PerformanceClip,
  elapsed: number,
): ReferencePose {
  const clip = data.clips[id],
    frames = clip.frames;
  const t = THREE.MathUtils.clamp(elapsed, 0, clip.duration);
  let hi = 1;
  while (hi < frames.length - 1 && frames[hi].time < t) hi++;
  const a = frames[hi - 1],
    b = frames[hi],
    weight = b.time > a.time ? (t - a.time) / (b.time - a.time) : 0;
  return {
    root: new THREE.Vector3()
      .fromArray(a.root)
      .lerp(new THREE.Vector3().fromArray(b.root), weight),
    support: THREE.MathUtils.lerp(a.support, b.support, weight),
    rotations: new Map(
      data.bones.map((name, i) => [
        name,
        new THREE.Quaternion()
          .fromArray(a.rotations, 4 * i)
          .normalize()
          .slerp(
            new THREE.Quaternion().fromArray(b.rotations, 4 * i).normalize(),
            weight,
          ),
      ]),
    ),
  };
}
export function emotePose(id: EmoteId, elapsed: number, reduced = false) {
  const descriptor = emoteDescriptors.find((e) => e.id === id)!;
  const duration = data.clips[id].duration;
  return {
    pose: samplePerformance(
      id,
      reduced ? duration * 0.4 : id === "dance" ? elapsed % duration : elapsed,
    ),
    weight: reduced
      ? 1
      : THREE.MathUtils.smoothstep(elapsed, 0, 0.18) *
        (1 -
          THREE.MathUtils.smoothstep(
            elapsed,
            descriptor.duration - 0.2,
            descriptor.duration,
          )),
  };
}
export function performanceMarker(id: EquipmentClip) {
  const clip = data.clips[id];
  const marker = clip.markers.find(
    (m) => m.name === (id.startsWith("equip") ? "grip" : "release"),
  );
  if (!marker) throw new Error(`Missing authored handoff marker for ${id}`);
  return marker.time / clip.duration;
}
export const WIELD_TRANSITION_SECONDS = Object.freeze({
  oneHand: 0.8,
  twoHand: 1,
});
