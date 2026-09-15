import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  emoteDescriptors,
  WIELD_TRANSITION_SECONDS,
  isWieldHandCovered,
} from "../src/index";
import {
  createPerformanceFixture,
  deferred,
} from "./helpers/performance-fixture";
import { itemBodyCrossings } from "./helpers/performance-collision";

type Fixture = Awaited<ReturnType<typeof createPerformanceFixture>>;
function presented(object: THREE.Object3D, avatar: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === avatar) return true;
  }
  return false;
}
function frames(s: Fixture, seconds: number, reducedMotion = false) {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++)
    s.tick({ reducedMotion });
}
function coveredHands(s: Fixture) {
  let count = 0;
  s.avatar.object.traverse((node) => {
    if (node instanceof THREE.Mesh && isWieldHandCovered(node)) count++;
  });
  return count;
}
const duration = (id: string) => {
  const descriptor = emoteDescriptors.find((entry) => entry.id === id);
  assert.ok(descriptor, `missing public descriptor ${id}`);
  return descriptor.duration;
};

test("one- and two-hand draw/stow keep one logical owner, one visibility marker and exact visible grips", async () => {
  for (const weight of [-1, 0, 1])
    for (const shared of [false, true]) {
      const s = await createPerformanceFixture({ weight });
      try {
        await s.controller.setLoadout(
          shared ? s.shared() : s.loadout(null, "wield-doodle-rocket"),
        );
        const owner = s.controller.getHand("right")!;
        const original = s.controller.loadout;
        const seconds = shared
          ? WIELD_TRANSITION_SECONDS.twoHand
          : WIELD_TRANSITION_SECONDS.oneHand;
        assert.equal(s.controller.isDrawn(), true);
        for (const drawn of [false, true]) {
          const visibility: boolean[] = [
            presented(owner.object, s.avatar.object),
          ];
          s.controller.setDrawn(drawn);
          for (
            let frame = 0;
            frame < Math.ceil((seconds + 0.1) * 60);
            frame++
          ) {
            // Repeated targets must not keep restarting a transition.
            if (frame % 3 === 0) s.controller.setDrawn(drawn);
            s.tick();
            assert.equal(s.controller.getHand("right")!.object, owner.object);
            assert.deepEqual(s.controller.loadout, original);
            if (shared)
              assert.equal(s.controller.getHand("left")!.object, owner.object);
            visibility.push(presented(owner.object, s.avatar.object));
            if (visibility.at(-1)) assert.ok(s.gripError() < 1e-5);
          }
          assert.equal(s.controller.isDrawn(), drawn);
          assert.equal(visibility.at(-1), drawn);
          assert.equal(
            visibility.slice(1).filter((value, i) => value !== visibility[i])
              .length,
            1,
          );
          if (!drawn)
            assert.equal(
              coveredHands(s),
              0,
              "stowed items restore relaxed hands",
            );
        }
        assert.equal(s.errors.length, 0);
      } finally {
        s.dispose();
      }
    }
});

test("a single-hand transition does not release the opposite hand or duplicate its input ownership", async () => {
  const s = await createPerformanceFixture();
  try {
    await s.controller.setLoadout(
      s.loadout("wield-doodle-rocket", "wield-bubble-comet"),
    );
    const right = s.controller.getHand("right")!.object;
    s.controller.setDrawn(false, { hand: "left" });
    s.controller.press("left");
    s.controller.press("right");
    s.tick();
    assert.equal(s.controller.isDrawn("left"), false);
    assert.equal(s.controller.isDrawn("right"), true);
    assert.equal(s.controller.getHand("right")!.object, right);
    assert.deepEqual(
      s.events.map((event) => event.hand),
      ["right"],
    );
    frames(s, WIELD_TRANSITION_SECONDS.oneHand + 0.1);
    assert.equal(
      presented(s.controller.getHand("left")!.object, s.avatar.object),
      false,
    );
    assert.equal(presented(right, s.avatar.object), true);
    assert.ok(s.gripError() < 1e-5);
  } finally {
    s.dispose();
  }
});

test("late asset completion cannot resurrect a stowed item and a failed swap retains the old owner", async () => {
  const gate = deferred();
  let failing = false;
  const s = await createPerformanceFixture({
    delay: (url) =>
      url.pathname.endsWith("wield-wake-driver.glb")
        ? gate.promise
        : Promise.resolve(),
    fail: (url) => failing && url.pathname.endsWith("wield-bonk-bouquet.glb"),
  });
  try {
    await s.controller.setLoadout(s.loadout(null, "wield-doodle-rocket"));
    const initial = s.controller.getHand("right")!.object;
    const pending = s.controller.setLoadout(s.shared("wield-wake-driver"));
    assert.equal(s.controller.getHand("right")!.object, initial);
    assert.equal(
      presented(initial, s.avatar.object),
      true,
      "loading must retain the old complete model",
    );
    s.controller.setDrawn(false);
    frames(s, 1.2);
    gate.resolve();
    assert.equal(await pending, true);
    const next = s.controller.getHand("right")!.object;
    assert.notEqual(next, initial);
    assert.equal(s.controller.isDrawn(), false);
    assert.equal(presented(next, s.avatar.object), false);
    assert.equal(coveredHands(s), 0);
    failing = true;
    await assert.rejects(
      s.controller.setLoadout(s.loadout(null, "wield-bonk-bouquet")),
    );
    assert.equal(s.controller.getHand("right")!.object, next);
    assert.equal(presented(next, s.avatar.object), false);
  } finally {
    gate.resolve();
    s.dispose();
  }
});

test("draw/stow refreshes, appearance swaps and external elapsed never reset or advance the owned clock unexpectedly", async () => {
  const s = await createPerformanceFixture();
  try {
    await s.controller.setLoadout(s.shared());
    s.controller.setDrawn(false, { elapsed: 0.35 });
    const before = structuredClone(s.controller.diagnostics().presentation);
    for (let i = 0; i < 12; i++) s.avatar.refreshPose();
    assert.deepEqual(s.controller.diagnostics().presentation, before);
    await s.avatar.setAppearance({ ...s.recipe, body: { weight: 1 } });
    assert.deepEqual(s.controller.diagnostics().presentation, before);
    s.controller.setDrawn(false, { elapsed: WIELD_TRANSITION_SECONDS.twoHand });
    assert.equal(s.controller.isDrawn(), false);
    assert.equal(
      presented(s.controller.getHand("right")!.object, s.avatar.object),
      false,
    );
    s.controller.setDrawn(true, { immediate: true });
    assert.equal(s.controller.isDrawn(), true);
    assert.ok(s.gripError() < 1e-5);
    s.controller.setDrawn(false);
    s.tick({ reducedMotion: true });
    assert.equal(s.controller.isDrawn(), false);
    s.controller.setDrawn(true);
    s.tick({ reducedMotion: true });
    assert.equal(s.controller.isDrawn(), true);
  } finally {
    s.dispose();
  }
});

test("local emotes temporarily stow and restore the same approved item owners without moving the player", async () => {
  for (const id of ["wave", "cheer", "dance", "yes", "no"] as const) {
    const s = await createPerformanceFixture();
    try {
      await s.controller.setLoadout(s.shared());
      const original = s.controller.getHand("right")!.object;
      s.avatar.object.position.set(3, 1, -4);
      s.avatar.object.rotation.y = 0.7;
      const position = s.avatar.object.position.clone(),
        rotation = s.avatar.object.quaternion.clone();
      s.avatar.playEmote(id);
      frames(s, WIELD_TRANSITION_SECONDS.twoHand + 0.1);
      assert.equal(s.controller.isDrawn(), false);
      assert.equal(presented(original, s.avatar.object), false);
      frames(s, duration(id) + WIELD_TRANSITION_SECONDS.twoHand + 0.5);
      assert.equal(s.controller.isDrawn(), true);
      assert.equal(s.controller.getHand("right")!.object, original);
      assert.deepEqual(s.avatar.object.position, position);
      assert.ok(s.avatar.object.quaternion.angleTo(rotation) < 1e-8);
      assert.ok(s.gripError() < 1e-5);
      assert.equal(s.events.length, 0);
      assert.equal(s.errors.length, 0);
    } finally {
      s.dispose();
    }
  }
});

test("explicit stow during an emote supersedes automatic restoration, including an idempotent stowed target", async () => {
  const s = await createPerformanceFixture();
  try {
    await s.controller.setLoadout(s.loadout(null, "wield-doodle-rocket"));
    s.avatar.playEmote("dance");
    frames(s, 1.1);
    assert.equal(s.controller.isDrawn(), false);
    s.controller.setDrawn(false);
    s.avatar.cancelEmote();
    frames(s, duration("dance") + 1.2);
    assert.equal(s.controller.isDrawn(), false);
    assert.equal(
      presented(s.controller.getHand("right")!.object, s.avatar.object),
      false,
    );
    s.controller.setDrawn(true, { immediate: true });
    assert.equal(s.controller.isDrawn(), true);
  } finally {
    s.dispose();
  }
});

test("a replacement loadout and disposal invalidate pending emote restoration", async () => {
  const gate = deferred();
  const s = await createPerformanceFixture({
    delay: (url) =>
      url.pathname.endsWith("wield-wake-driver.glb")
        ? gate.promise
        : Promise.resolve(),
  });
  try {
    await s.controller.setLoadout(s.shared());
    const old = s.controller.getHand("right")!.object;
    s.avatar.playEmote("wave");
    frames(s, 1.1);
    const pending = s.controller.setLoadout(s.shared("wield-wake-driver"));
    s.controller.setDrawn(false);
    s.avatar.cancelEmote();
    s.avatar.dispose();
    gate.resolve();
    assert.equal(await pending, false);
    frames(s, 5);
    assert.equal(s.controller.state, "disposed");
    assert.equal(s.controller.getHand("right"), undefined);
    assert.equal(old.parent, null);
    assert.equal(s.avatar.object.children.length, 0);
    assert.equal(s.events.length, 0);
  } finally {
    gate.resolve();
    s.dispose();
  }
});

test("authoritative rapid reversal preserves the current presentation and immediate takes precedence over elapsed", async () => {
  for (const shared of [false, true]) {
    const s = await createPerformanceFixture();
    try {
      await s.controller.setLoadout(
        shared ? s.shared() : s.loadout(null, "wield-doodle-rocket"),
      );
      const seconds = shared
        ? WIELD_TRANSITION_SECONDS.twoHand
        : WIELD_TRANSITION_SECONDS.oneHand;
      s.controller.setDrawn(false, { elapsed: seconds * 0.37 });
      const from = s.controller.diagnostics().presentation.right!.progress;
      const before = s.controller.getHand("right")!.object.matrixWorld.clone();
      s.controller.setDrawn(true, { elapsed: 0, from });
      assert.equal(
        s.controller.diagnostics().presentation.right!.progress,
        from,
      );
      const after = s.controller.getHand("right")!.object.matrixWorld;
      assert.ok(
        Math.max(
          ...after.elements.map((value, i) =>
            Math.abs(value - before.elements[i]),
          ),
        ) < 1e-6,
        "reversing the accepted timeline cannot jump the visible object",
      );
      s.controller.setDrawn(true, { elapsed: seconds, from });
      assert.equal(s.controller.isDrawn(), true);
      s.controller.setDrawn(false, { elapsed: 0, from, immediate: true });
      assert.equal(s.controller.diagnostics().presentation.right!.progress, 0);
      assert.equal(
        presented(s.controller.getHand("right")!.object, s.avatar.object),
        false,
      );
      const settled = structuredClone(s.controller.diagnostics().presentation);
      for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
        assert.throws(() =>
          s.controller.setDrawn(true, { elapsed: 0, from: invalid }),
        );
        assert.deepEqual(s.controller.diagnostics().presentation, settled);
      }
    } finally {
      s.dispose();
    }
  }
});

test("replacing a queued local emote preserves the original partial-hand state and emits no held-item action", async () => {
  const s = await createPerformanceFixture();
  try {
    await s.controller.setLoadout(
      s.loadout("wield-doodle-rocket", "wield-bubble-comet"),
    );
    const left = s.controller.getHand("left")!.object,
      right = s.controller.getHand("right")!.object;
    s.controller.setDrawn(false, { hand: "left", immediate: true });
    s.avatar.playEmote("dance");
    frames(s, 0.2);
    s.avatar.playEmote("wave");
    frames(s, 0.2);
    s.avatar.playEmote("yes");
    frames(s, duration("yes") + 2);
    assert.equal(s.controller.getHand("left")!.object, left);
    assert.equal(s.controller.getHand("right")!.object, right);
    assert.equal(s.controller.isDrawn("left"), false);
    assert.equal(s.controller.isDrawn("right"), true);
    assert.equal(presented(left, s.avatar.object), false);
    assert.equal(presented(right, s.avatar.object), true);
    assert.equal(s.events.length, 0);
  } finally {
    s.dispose();
  }
});

test("hidden equipment presentation cannot deadlock local emote preparation or reveal a stowed item on inspection restore", async () => {
  const s = await createPerformanceFixture();
  try {
    await s.controller.setLoadout(s.shared());
    const owner = s.controller.getHand("right")!.object;
    s.controller.setVisible(false);
    s.avatar.playEmote("cheer");
    frames(s, duration("cheer") + 2.3);
    assert.equal(
      s.controller.isDrawn(),
      true,
      "hidden equipment still completes its owned transition clocks",
    );
    assert.equal(presented(owner, s.avatar.object), false);
    s.controller.setDrawn(false, { immediate: true });
    s.controller.setVisible(true);
    assert.equal(presented(owner, s.avatar.object), false);
    assert.equal(coveredHands(s), 0);
    assert.equal(s.events.length, 0);
  } finally {
    s.dispose();
  }
});

test("equipment reach keeps every approved rigid item outside actual trunk, legs and ground", async () => {
  for (const weight of [-1, 0, 1]) {
    const s = await createPerformanceFixture({ weight });
    try {
      for (const asset of s.gear.catalog.items)
        for (const primary of ["left", "right"] as const) {
          const item = asset.id;
          await s.controller.setLoadout(
            asset.twoHanded
              ? s.shared(item, primary)
              : s.loadout(
                  primary === "left" ? item : null,
                  primary === "right" ? item : null,
                ),
          );
          const seconds = asset.twoHanded
            ? WIELD_TRANSITION_SECONDS.twoHand
            : WIELD_TRANSITION_SECONDS.oneHand;
          for (let step = 0; step <= 10; step++) {
            const elapsed = (step * seconds) / 10;
            s.controller.setDrawn(true, { elapsed });
            const owner = s.controller.getHand(primary)!.object;
            if (!presented(owner, s.avatar.object)) continue;
            const chestY = s.avatar
              .attachmentView()!
              .sockets.get("chest")!
              .getWorldPosition(new THREE.Vector3()).y;
            const crossings = itemBodyCrossings(s.avatar.object, owner, chestY);
            assert.equal(
              crossings.count,
              0,
              `${item}, primary ${primary}, weight ${weight}, elapsed ${elapsed}: body crossed at ${JSON.stringify(crossings.points)}`,
            );
            assert.ok(s.gripError() < 1e-5);
            let lowest = Infinity;
            owner.traverse((mesh) => {
              if (!(mesh instanceof THREE.Mesh) || mesh.userData.comicOutline)
                return;
              for (
                let vertex = 0;
                vertex < mesh.geometry.attributes.position.count;
                vertex++
              )
                lowest = Math.min(
                  lowest,
                  mesh
                    .getVertexPosition(vertex, new THREE.Vector3())
                    .applyMatrix4(mesh.matrixWorld).y,
                );
            });
            assert.ok(
              lowest >= -0.003,
              `${item}, primary ${primary}, weight ${weight}, elapsed ${elapsed}: actual item below ground by ${-lowest}m`,
            );
          }
        }
    } finally {
      s.dispose();
    }
  }
});

test("starting a stow cancels a queued activation before it can escape on the next frame", async () => {
  const s = await createPerformanceFixture();
  try {
    await s.controller.setLoadout(s.loadout(null, "wield-doodle-rocket"));
    s.controller.press("right");
    s.controller.setDrawn(false);
    s.tick();
    assert.equal(s.events.length, 0);
    assert.ok(s.callbacks.some((call) => call.type === "cancel"));
    frames(s, 1);
    s.controller.press("right");
    s.tick();
    assert.equal(s.events.length, 0);
  } finally {
    s.dispose();
  }
});
