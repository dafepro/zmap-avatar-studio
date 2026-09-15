import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createPerformanceFixture } from "./helpers/performance-fixture";
import { smoothLocomotion, type LocomotionClip } from "../src/locomotion";
import { locomotionData } from "../src/locomotion-data";

// Measure the rendered FK chain after shoe support fitting, not just source keys.
// Limits are in avatar metres / seconds cubed. Feet have genuine contact events;
// these vertical limits qualify ordinary locomotion, not impacts or action poses.
test("rendered gait bounds vertical jerk at 60 and 120 Hz in every direction", async () => {
  const points = [
    "hips",
    "chest",
    "head",
    "hand_L",
    "hand_R",
    "foot_L",
    "foot_R",
  ];
  for (const fps of [60, 120])
    for (const speed of [2.2, 5.4])
      for (const angle of [
        0,
        Math.PI / 4,
        Math.PI / 2,
        Math.PI,
        -Math.PI / 2,
      ]) {
        const fixture = await createPerformanceFixture();
        try {
          const samples = points.map(() => [] as number[]);
          for (let frame = 0; frame < fps * 5; frame++) {
            fixture.tick(
              {
                velocity: {
                  x: Math.sin(angle) * speed,
                  z: Math.cos(angle) * speed,
                },
              },
              1 / fps,
            );
            if (frame < fps) continue;
            const view = fixture.avatar.attachmentView()!;
            points.forEach((name, i) =>
              samples[i].push(
                view.sockets.get(name)!.getWorldPosition(new THREE.Vector3()).y,
              ),
            );
          }
          samples.forEach((values, i) => {
            // Do not allow a frozen pose to satisfy the continuity gate.
            if (points[i] === "head")
              assert.ok(Math.max(...values) - Math.min(...values) > 0.025);
            let derivative = values;
            for (let order = 0; order < 3; order++) {
              const previous = derivative;
              derivative = previous
                .slice(1)
                .map((value, j) => (value - previous[j]) * fps);
            }
            const peak = Math.max(...derivative.map(Math.abs));
            const limit = speed < 3 && angle === Math.PI ? 50000 : 35000;
            assert.ok(
              peak < limit,
              `${points[i]}: ${fps} Hz, speed ${speed}, angle ${angle}: jerk ${peak} exceeds ${limit}`,
            );
          });
        } finally {
          fixture.dispose();
        }
      }
});

test("periodic playback preserves velocity and acceleration through the loop seam", () => {
  const h = 1e-5;
  for (const clip of Object.keys(locomotionData.clips) as LocomotionClip[]) {
    const poses = [-2, -1, 0, 1, 2].map((i) => smoothLocomotion(clip, i * h));
    for (const name of locomotionData.bones) {
      // A rotated unit vector avoids quaternion sign ambiguity at the seam.
      const p = poses.map((pose) =>
        new THREE.Vector3(0, 1, 0).applyQuaternion(pose.rotations.get(name)!),
      );
      const left = p[2]
        .clone()
        .add(p[0])
        .addScaledVector(p[1], -2)
        .multiplyScalar(1 / (h * h));
      const right = p[4]
        .clone()
        .add(p[2])
        .addScaledVector(p[3], -2)
        .multiplyScalar(1 / (h * h));
      assert.ok(
        left.distanceTo(right) < 5,
        `${clip}/${name}: discontinuous loop acceleration`,
      );
    }
  }
});
