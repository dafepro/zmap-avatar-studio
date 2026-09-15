import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  createPerformanceFixture,
  performanceEquipment,
} from "./helpers/performance-fixture";

test("relaxed walking keeps soft knees and a full backward step with either hand or shared grips", async () => {
  const item = performanceEquipment.items.find(
    (i) => !i.id.includes("rebound") && i.id.startsWith("wield-"),
  )!.id;
  for (const direction of [-1, 1]) {
    const s = await createPerformanceFixture();
    try {
      for (const loadout of [
        s.loadout(),
        s.loadout(item),
        s.loadout(null, item),
        s.loadout(item, item),
        s.shared(),
      ]) {
        await s.controller.setLoadout(loadout);
        const steps: number[] = [];
        let minKnee = Infinity,
          maxKnee = 0;
        for (let frame = 0; frame < 300; frame++) {
          s.tick({ velocity: { x: 0, z: direction * 2.2 } });
          if (frame < 60) continue;
          for (const foot of Object.values(
            s.avatar.animationDiagnostics().feet,
          )) {
            minKnee = Math.min(minKnee, foot.kneeDegrees);
            maxKnee = Math.max(maxKnee, foot.kneeDegrees);
          }
          steps.push(
            s.avatar
              .attachmentView()!
              .sockets.get("foot_L")!
              .getWorldPosition(new Vector3()).z,
          );
          assert.ok(s.gripError() < 1e-5);
        }
        assert.ok(minKnee > 5 && minKnee < 20, `trailing knee ${minKnee}`);
        assert.ok(maxKnee < 100 && maxKnee > 45, `swing knee ${maxKnee}`);
        assert.ok(
          Math.max(...steps) - Math.min(...steps) > 0.74,
          "stride became a short shuffle",
        );
      }
      assert.deepEqual(s.errors, []);
    } finally {
      s.dispose();
    }
  }
});

test("walking direction transitions preserve one-hand and two-hand grips", async () => {
  const s = await createPerformanceFixture();
  try {
    const item = performanceEquipment.items[0].id;
    for (const loadout of [
      s.loadout(item),
      s.loadout(null, item),
      s.loadout(item, item),
      s.shared(),
    ]) {
      await s.controller.setLoadout(loadout);
      for (let frame = 0; frame < 960; frame++) {
        const angle = (Math.floor(frame / 120) * Math.PI) / 4;
        s.tick({
          velocity: { x: 2.2 * Math.sin(angle), z: 2.2 * Math.cos(angle) },
        });
        assert.ok(s.gripError() < 1e-5);
        const diagnostics = s.avatar.animationDiagnostics();
        for (const foot of Object.values(diagnostics.feet))
          assert.ok(Number.isFinite(foot.kneeDegrees));
      }
    }
    assert.deepEqual(s.errors, []);
  } finally {
    s.dispose();
  }
});
