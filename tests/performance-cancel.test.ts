import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createPerformanceFixture } from "./helpers/performance-fixture";

test("external emote cancellation fades the displayed pose while equipment continues its new draw", async () => {
  const s = await createPerformanceFixture();
  try {
    await s.controller.setLoadout(s.shared());
    s.controller.setDrawn(false, { immediate: true });
    s.tick({ emote: { id: "wave", elapsed: 0.8 } });
    const owner = s.controller.getHand("right")!.object;
    const arm = s.avatar.attachmentView()!.sockets.get("arm_R")!;
    const before = arm.getWorldQuaternion(new THREE.Quaternion());
    s.controller.setDrawn(true, { from: 0, elapsed: 0 });
    s.tick();
    assert.ok(
      arm.getWorldQuaternion(new THREE.Quaternion()).angleTo(before) < 0.35,
      "omitting an accepted mid-wave emote must not snap the raised arm to rest",
    );
    assert.ok(s.avatar.animationDiagnostics().emote?.weight! > 0.85);
    assert.equal(
      s.controller.diagnostics().presentation.right?.phase,
      "drawing",
    );
    for (let i = 0; i < 75; i++) {
      s.controller.setDrawn(true, { from: 0, elapsed: (i + 1) / 60 });
      s.tick();
    }
    assert.equal(s.avatar.animationDiagnostics().emote, undefined);
    assert.equal(s.controller.isDrawn(), true);
    assert.equal(s.controller.getHand("right")!.object, owner);
    assert.equal(s.errors.length, 0);
    assert.equal(s.events.length, 0);
  } finally {
    s.dispose();
  }
});

test("canceling an explicit clip preserves a frozen exit pose through refresh and ends on subsequent ticks", async () => {
  const s = await createPerformanceFixture();
  try {
    s.tick({ emote: { id: "cheer", elapsed: 0.65 } });
    s.avatar.cancelEmote();
    s.avatar.refreshPose();
    const socket = s.avatar.attachmentView()!.sockets.get("arm_R")!;
    const pose = socket.quaternion.clone();
    const clock = structuredClone(s.avatar.animationDiagnostics().emote);
    for (let i = 0; i < 10; i++) s.avatar.refreshPose();
    assert.ok(socket.quaternion.angleTo(pose) < 1e-7);
    assert.deepEqual(s.avatar.animationDiagnostics().emote, clock);
    for (let i = 0; i < 15; i++) s.tick();
    assert.equal(s.avatar.animationDiagnostics().emote, undefined);
    assert.equal(s.errors.length, 0);
  } finally {
    s.dispose();
  }
});
