import { test } from "node:test";
import assert from "node:assert/strict";
import type * as THREE from "three";
import { WIELD_TRANSITION_SECONDS } from "../src/index";
import {
  createPerformanceFixture,
  deferred,
} from "./helpers/performance-fixture";

type Fixture = Awaited<ReturnType<typeof createPerformanceFixture>>;

function presented(object: THREE.Object3D, avatar: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === avatar) return true;
  }
  return false;
}

function progress(s: Fixture) {
  return s.controller.diagnostics().presentation.right!.progress;
}

test("external equipment time hands over locally at the visible checkpoint without a dt0 jump", async () => {
  for (const shared of [false, true]) {
    const s = await createPerformanceFixture();
    try {
      await s.controller.setLoadout(
        shared ? s.shared() : s.loadout(null, "wield-doodle-rocket"),
      );
      const seconds = shared
        ? WIELD_TRANSITION_SECONDS.twoHand
        : WIELD_TRANSITION_SECONDS.oneHand;
      s.controller.setDrawn(false, { from: 0.4, elapsed: seconds * 0.25 });
      const checkpoint = progress(s);
      assert.ok(Math.abs(checkpoint - 0.3) < 1e-10);
      for (let frame = 0; frame < 12; frame++) s.tick();
      assert.equal(progress(s), checkpoint, "an explicit clock stays pinned");

      s.controller.setDrawn(false);
      assert.equal(progress(s), checkpoint, "ownership transfer is continuous");
      for (let frame = 0; frame < 12; frame++) {
        s.avatar.refreshPose();
        s.tick({}, 0);
      }
      assert.equal(progress(s), checkpoint, "refreshes cannot advance time");

      s.controller.setPaused(true);
      for (let frame = 0; frame < 30; frame++) s.tick();
      assert.equal(
        progress(s),
        checkpoint,
        "a paused local clock stays pinned",
      );
      s.controller.setPaused(false);
      s.tick();
      assert.ok(progress(s) < checkpoint && progress(s) > 0);
      for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) s.tick();
      assert.equal(progress(s), 0);
    } finally {
      s.dispose();
    }
  }
});

test("hidden equipped owners do not deadlock emotes or become visible while completing them", async () => {
  for (const shared of [false, true]) {
    const s = await createPerformanceFixture();
    try {
      await s.controller.setLoadout(
        shared ? s.shared() : s.loadout(null, "wield-doodle-rocket"),
      );
      const owner = s.controller.getHand("right")!.object;
      const requests = s.requested.length;
      s.controller.setVisible(false);
      s.avatar.playEmote("wave");
      let played = false;
      for (let frame = 0; frame < 360; frame++) {
        s.tick();
        const emote = s.avatar.animationDiagnostics().emote;
        played ||= emote?.id === "wave" && emote.elapsed > 0 && !emote.waiting;
        assert.equal(presented(owner, s.avatar.object), false);
        assert.equal(s.controller.getHand("right")!.object, owner);
      }
      assert.equal(
        played,
        true,
        "hidden equipment must release the pose layer",
      );
      assert.equal(s.avatar.animationDiagnostics().emote, undefined);
      assert.equal(
        s.requested.length,
        requests,
        "visibility keeps loaded assets",
      );
      s.controller.setVisible(true);
      assert.equal(presented(owner, s.avatar.object), true);
      assert.equal(s.controller.isDrawn(), true);
      assert.equal(s.events.length, 0);
      assert.equal(s.errors.length, 0);
    } finally {
      s.dispose();
    }
  }
});

test("a local emote takes over a pinned equipment clock and cannot resurrect its stale checkpoint", async () => {
  for (const originallyDrawn of [false, true]) {
    const s = await createPerformanceFixture();
    try {
      await s.controller.setLoadout(s.loadout(null, "wield-doodle-rocket"));
      s.controller.setDrawn(originallyDrawn, { from: 0.4, elapsed: 0.2 });
      const owner = s.controller.getHand("right")!.object;
      s.avatar.playEmote("wave");
      let played = false;
      for (let frame = 0; frame < 360; frame++) {
        s.tick();
        const emote = s.avatar.animationDiagnostics().emote;
        played ||= emote?.id === "wave" && emote.elapsed > 0 && !emote.waiting;
      }
      assert.equal(played, true);
      assert.equal(s.avatar.animationDiagnostics().emote, undefined);
      assert.equal(progress(s), originallyDrawn ? 1 : 0);
      for (let frame = 0; frame < 60; frame++) {
        s.avatar.refreshPose();
        s.tick();
        assert.equal(progress(s), originallyDrawn ? 1 : 0);
        assert.equal(presented(owner, s.avatar.object), originallyDrawn);
      }
      assert.equal(s.controller.getHand("right")!.object, owner);
      assert.equal(s.events.length, 0);
    } finally {
      s.dispose();
    }
  }
});

test("refreshing an old explicit emote cannot erase a newly requested local emote", async () => {
  for (const refresh of ["pose", "appearance", "controller"] as const) {
    const s = await createPerformanceFixture();
    try {
      s.tick({ emote: { id: "wave", elapsed: 0.8 } });
      s.avatar.playEmote("cheer");
      if (refresh === "pose") s.avatar.refreshPose();
      else if (refresh === "appearance")
        await s.avatar.setAppearance({ ...s.recipe, body: { weight: 1 } });
      else s.controller.setVisible(false);
      s.tick();
      const emote = s.avatar.animationDiagnostics().emote;
      assert.equal(emote?.id, "cheer", `${refresh} must retain the new owner`);
      assert.ok(Math.abs(emote.elapsed - 1 / 60) < 1e-10);
      s.avatar.refreshPose();
      assert.deepEqual(s.avatar.animationDiagnostics().emote, emote);
    } finally {
      s.dispose();
    }
  }
});

test("cancelling an externally timed emote survives a visual refresh", async () => {
  const s = await createPerformanceFixture();
  try {
    s.tick({ emote: { id: "wave", elapsed: 0.8 } });
    s.avatar.cancelEmote();
    s.avatar.refreshPose();
    assert.equal(s.avatar.animationDiagnostics().emote?.elapsed, 0.8);
    for (let frame = 0; frame < 12; frame++) s.tick();
    assert.equal(s.avatar.animationDiagnostics().emote, undefined);
    // The bounded exit fade did not restart the canceled source clock.
    // A new explicit request is still allowed to take ownership.
    s.tick({ emote: { id: "yes", elapsed: 0.8 } });
    assert.equal(s.avatar.animationDiagnostics().emote?.id, "yes");
  } finally {
    s.dispose();
  }
});

test("reduced motion and interrupted clocks retire an external equipment transition until its target changes", async () => {
  for (const interrupted of [false, true])
    for (const drawn of [false, true]) {
      const s = await createPerformanceFixture();
      try {
        await s.controller.setLoadout(s.loadout(null, "wield-doodle-rocket"));
        s.controller.setDrawn(!drawn, { immediate: true });
        const from = drawn ? 0 : 1;
        s.controller.setDrawn(drawn, { from, elapsed: 0.2 });
        assert.ok(progress(s) > 0 && progress(s) < 1);
        s.tick({ reducedMotion: !interrupted }, interrupted ? 1 : 1 / 60);
        const endpoint = drawn ? 1 : 0;
        assert.equal(progress(s), endpoint);
        for (let frame = 0; frame < 12; frame++) {
          s.tick();
          assert.equal(progress(s), endpoint, "a stale clock cannot resume");
        }
        s.controller.setDrawn(drawn, { from, elapsed: 0.2 });
        s.tick();
        assert.equal(progress(s), endpoint, "a replayed target stays resolved");
        s.controller.setDrawn(!drawn, { from: endpoint, elapsed: 0 });
        assert.equal(progress(s), endpoint);
        s.controller.setDrawn(!drawn, { from: endpoint, elapsed: 0.4 });
        assert.ok(Math.abs(progress(s) - 0.5) < 1e-10);
      } finally {
        s.dispose();
      }
    }
});

test("replacing an owner cannot revive a checkpoint retired by an emote or reduced motion", async () => {
  for (const cause of ["emote", "reduced"] as const) {
    const s = await createPerformanceFixture();
    try {
      await s.controller.setLoadout(s.loadout(null, "wield-doodle-rocket"));
      s.controller.setDrawn(false, { from: 0.4, elapsed: 0.2 });
      if (cause === "emote") {
        s.avatar.playEmote("wave");
        for (let frame = 0; frame < 360; frame++) s.tick();
      } else {
        s.tick({ reducedMotion: true });
        s.tick();
      }
      assert.equal(progress(s), 0);
      await s.controller.setLoadout(s.loadout(null, "wield-bubble-comet"));
      const replacement = s.controller.getHand("right")!.object;
      for (let frame = 0; frame < 60; frame++) {
        s.tick();
        assert.equal(progress(s), 0, `${cause} retires time across owners`);
        assert.equal(presented(replacement, s.avatar.object), false);
      }
      // Retirement must not discard a later explicit transition to a new target.
      s.controller.setDrawn(true, { from: 0, elapsed: 0.2 });
      await s.controller.setLoadout(s.loadout(null, "wield-doodle-rocket"));
      assert.ok(Math.abs(progress(s) - 0.25) < 1e-10);
      s.tick();
      assert.ok(Math.abs(progress(s) - 0.25) < 1e-10);
    } finally {
      s.dispose();
    }
  }
});

test("atomic dual-hand completion uses the latest intent even when one model finished staging earlier", async () => {
  for (const duringEmote of [false, true]) {
    const gate = deferred();
    const s = await createPerformanceFixture({
      delay: (url) =>
        url.pathname.endsWith("wield-bubble-comet.glb")
          ? gate.promise
          : Promise.resolve(),
    });
    try {
      // Warm the left model and grip cache, then remove their live owners. Its
      // next stage completes entirely in microtasks while the right fetch waits.
      await s.controller.setLoadout(s.loadout("wield-doodle-rocket"));
      await s.controller.setLoadout(s.loadout());
      const pending = s.controller.setLoadout(
        s.loadout("wield-doodle-rocket", "wield-bubble-comet"),
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(s.controller.getHand("left"), undefined);
      assert.ok(
        s.requested.some((path) => path.endsWith("wield-bubble-comet.glb")),
      );
      if (duringEmote) {
        s.avatar.playEmote("wave");
        s.tick();
      } else s.controller.setDrawn(false, { immediate: true });
      const before = s.avatar.animationDiagnostics().emote?.elapsed;
      gate.resolve();
      assert.equal(await pending, true);
      assert.equal(s.avatar.animationDiagnostics().emote?.elapsed, before);
      for (const hand of ["left", "right"] as const) {
        const owner = s.controller.getHand(hand)!;
        assert.equal(presented(owner.object, s.avatar.object), false);
        assert.equal(
          s.controller.diagnostics().presentation[hand]!.progress,
          0,
        );
      }
      for (let frame = 0; frame < 360; frame++) s.tick();
      assert.equal(s.avatar.animationDiagnostics().emote, undefined);
      for (const hand of ["left", "right"] as const) {
        const owner = s.controller.getHand(hand)!;
        assert.equal(presented(owner.object, s.avatar.object), duringEmote);
        assert.equal(s.controller.isDrawn(hand), duringEmote);
      }
      assert.equal(s.errors.length, 0);
      assert.equal(s.events.length, 0);
    } finally {
      gate.resolve();
      s.dispose();
    }
  }
});
