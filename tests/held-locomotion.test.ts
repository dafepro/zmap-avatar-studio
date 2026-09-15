import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { createPerformanceFixture } from "./helpers/performance-fixture";
import {
  fieldToolBehaviors,
  type FieldToolPresentation,
} from "../src/field-tools";
import { locomotionPace } from "../src/locomotion";

test("active winch and panel preserve the complete gait and exact grips while upper-body lean eases in", async () => {
  for (const [item, phase, lean] of [
    ["wield-rebound-panel", "braced", 0.15],
    ["wield-tether-winch", "reeling", -0.22],
  ] as const) {
    let presentation: FieldToolPresentation = { phase: "idle" };
    const held = await createPerformanceFixture({
      behaviors: fieldToolBehaviors(() => presentation),
    });
    const reference = await createPerformanceFixture();
    try {
      await held.controller.setLoadout(held.shared(item));
      for (let frame = 0; frame < 300; frame++) {
        const angle =
          frame < 100 ? 0 : frame < 200 ? Math.PI * 0.75 : -Math.PI * 0.75;
        const motion = {
          velocity: { x: Math.sin(angle) * 2.2, z: Math.cos(angle) * 2.2 },
        };
        if (frame === 30) presentation = { phase };
        held.tick({ ...motion, carryLean: frame >= 30 ? lean : 0 });
        reference.tick(motion);
        const a = held.avatar.attachmentView()!,
          b = reference.avatar.attachmentView()!;
        for (const bone of [
          "hips",
          "leg_L",
          "leg_R",
          "shin_L",
          "shin_R",
          "foot_L",
          "foot_R",
        ])
          assert.ok(
            a.sockets
              .get(bone)!
              .quaternion.angleTo(b.sockets.get(bone)!.quaternion) < 1e-6,
            `${item}/${bone}: tool action replaced gait`,
          );
        assert.ok(
          a.root.position.distanceTo(b.root.position) < 1e-7,
          `${item}: tool action changed support height`,
        );
        assert.ok(held.gripError() < 1e-5);
      }
      assert.deepEqual(held.errors, []);
    } finally {
      held.dispose();
      reference.dispose();
    }
  }
});

test("backward diagonals are dominated by backward travel rather than a forward strafe", () => {
  for (const side of [-1, 1]) {
    const pace = locomotionPace(5.4, {
      x: (side * 5.4) / Math.sqrt(2),
      z: -5.4 / Math.sqrt(2),
    });
    assert.ok(
      pace.components
        .filter((c) => c.reverse)
        .reduce((n, c) => n + c.weight, 0) > 0.85,
    );
    assert.ok(
      pace.components
        .filter((c) => c.clip.startsWith("Running_Strafe"))
        .reduce((n, c) => n + c.weight, 0) < 0.15,
    );
  }
});

test("backward panel walking keeps head and equipment bounce bounded across body weights and frame rates", async (t) => {
  const results = [];
  for (const weight of [-1, 0, 1])
    for (const fps of [60, 120])
      for (const phase of ["idle", "braced"] as const) {
        const s = await createPerformanceFixture({
          weight,
          behaviors: fieldToolBehaviors(() => ({ phase })),
        });
        try {
          await s.controller.setLoadout(s.shared());
          const head: number[] = [],
            panel: number[] = [];
          for (let frame = 0; frame < fps * 5; frame++) {
            s.tick(
              {
                velocity: { x: 0, z: -2.2 },
                carryLean: phase === "braced" ? 0.15 : 0,
              },
              1 / fps,
            );
            if (frame < fps) continue;
            head.push(
              s.avatar
                .attachmentView()!
                .sockets.get("head")!
                .getWorldPosition(new Vector3()).y,
            );
            panel.push(
              s.controller
                .getHand("right")!
                .object.getWorldPosition(new Vector3()).y,
            );
            assert.ok(s.gripError() < 1e-5);
          }
          const row: {
            weight: number;
            fps: number;
            phase: string;
            [name: string]: unknown;
          } = { weight, fps, phase };
          for (const [name, values] of [
            ["head", head],
            ["panel", panel],
          ] as const) {
            const range = Math.max(...values) - Math.min(...values);
            const velocity = values
              .slice(1)
              .map((v, i) => (v - values[i]) * fps);
            const acceleration = velocity
              .slice(1)
              .map((v, i) => (v - velocity[i]) * fps);
            const jerk = acceleration
              .slice(1)
              .map((v, i) => (v - acceleration[i]) * fps);
            const peakJerk = Math.max(...jerk.map(Math.abs));
            assert.ok(
              range > 0.015 && range < 0.08,
              `${weight}/${fps}/${phase}/${name}: vertical travel ${range}`,
            );
            assert.ok(
              peakJerk < 10000,
              `${weight}/${fps}/${phase}/${name}: jerk ${peakJerk}`,
            );
            row[name] = { range, peakJerk };
          }
          results.push(row);
          assert.deepEqual(s.errors, []);
        } finally {
          s.dispose();
        }
      }
  t.diagnostic(JSON.stringify(results));
});
