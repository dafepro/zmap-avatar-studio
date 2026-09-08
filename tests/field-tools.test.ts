import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { defaultRecipe, type Catalog } from "../src/core";
import { emptyWieldLoadout, type WieldCatalog } from "../src/wield-core";
import { WieldController, WieldLibrary } from "../src/wield-runtime";
import {
  fieldToolBehaviors,
  type FieldToolPresentation,
} from "../src/field-tools";
import "./helpers/node-image";
const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const equipment: WieldCatalog = JSON.parse(
  await readFile(
    new URL("../public/action/catalog.json", import.meta.url),
    "utf8",
  ),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("../public" + new URL(String(input)).pathname, import.meta.url),
    ),
  );
async function setup(read?: () => FieldToolPresentation | undefined) {
  const avatars = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    library = new WieldLibrary(
      equipment,
      "https://assets.test/action/",
      fetcher,
    ),
    avatar = avatars.create();
  await avatar.setAppearance(defaultRecipe(catalog));
  const controller = new WieldController(
    avatar,
    library,
    fieldToolBehaviors(read),
  );
  return {
    avatar,
    controller,
    equip: (item: string) =>
      controller.setLoadout({
        ...emptyWieldLoadout(equipment),
        twoHanded: { item, primary: "right" },
      }),
    dispose: () => {
      controller.dispose();
      avatar.dispose();
      avatars.dispose();
      library.dispose();
    },
  };
}

test("field preview mechanisms respect primary hold, release, reduced motion and restore source transforms", async () => {
  const s = await setup();
  let time = 0;
  for (const [id, mechanism] of [
    ["wield-tether-winch", "spool"],
    ["wield-wake-driver", "piston"],
  ]) {
    await s.equip(id);
    const node = s.controller.getHand("right")!.anchor(mechanism),
      baseline = node.position.clone(),
      rotation = node.quaternion.clone();
    s.controller.press("left");
    s.avatar.update((time += 0.05));
    assert.deepEqual(node.position, baseline);
    assert.ok(node.quaternion.angleTo(rotation) < 1e-8);
    s.controller.press("right");
    s.avatar.update((time += 0.05));
    assert.ok(
      node.position.distanceTo(baseline) > 0 ||
        node.quaternion.angleTo(rotation) > 0,
    );
    s.avatar.update((time += 0.05), { reducedMotion: true });
    assert.deepEqual(node.position, baseline);
    assert.ok(node.quaternion.angleTo(rotation) < 1e-8);
    s.controller.release("right");
    s.avatar.update((time += 0.05));
    assert.deepEqual(node.position, baseline);
    assert.ok(node.quaternion.angleTo(rotation) < 1e-8);
    s.controller.press("right");
    s.avatar.update((time += 0.05));
    s.controller.setPaused(true);
    s.avatar.update((time += 0.05));
    assert.deepEqual(node.position, baseline);
    assert.ok(node.quaternion.angleTo(rotation) < 1e-8);
    s.controller.setPaused(false);
  }
  s.dispose();
});

test("the panel presents a real bounded face indicator with rigid source anchors, world alignment and one owned disposal", async () => {
  const s = await setup();
  await s.equip("wield-rebound-panel");
  const held = s.controller.getHand("right")!,
    face = held.anchor("face"),
    impact = held.anchor("impact"),
    original = impact.position.clone();
  const indicator = held.effects.getObjectByName(
    "field-panel-ready",
  ) as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  assert.ok(indicator);
  assert.equal(s.controller.diagnostics().effectTriangles, 24);
  assert.equal(indicator.visible, false);
  let geometryDisposals = 0,
    materialDisposals = 0;
  indicator.geometry.addEventListener("dispose", () => geometryDisposals++);
  indicator.material.addEventListener("dispose", () => materialDisposals++);
  s.avatar.object.position.set(5, 2, -3);
  s.avatar.object.rotation.set(0.1, 0.7, -0.1);
  s.avatar.object.scale.setScalar(1.2);
  s.controller.press("left");
  s.avatar.update(0.05);
  assert.equal(indicator.visible, false);
  s.controller.press("right");
  s.avatar.update(0.1);
  assert.equal(indicator.visible, true);
  assert.deepEqual(impact.position, original);
  indicator.updateWorldMatrix(true, false);
  const expected = face.matrixWorld
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.004));
  assert.ok(
    indicator.matrixWorld.elements.every(
      (value, i) => Math.abs(value - expected.elements[i]) < 1e-6,
    ),
  );
  s.avatar.update(0.15, { reducedMotion: true });
  assert.equal(indicator.visible, true);
  assert.equal(indicator.material.opacity, 0.9);
  s.controller.cancel();
  s.avatar.update(0.2);
  assert.equal(indicator.visible, false);
  s.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});

test("accepted app state drives presentation without input and malformed progress cannot move the piston beyond its authored travel", async () => {
  let state: FieldToolPresentation | undefined = {
    phase: "charging",
    progress: 100,
  };
  const s = await setup(() => state);
  await s.equip("wield-wake-driver");
  const piston = s.controller.getHand("right")!.anchor("piston"),
    baseline = piston.position.clone();
  let time = 0;
  for (const progress of [100, -20, NaN, Infinity, 0.4]) {
    state = { phase: "charging", progress };
    s.avatar.update((time += 0.05));
    assert.ok(
      piston.position.y >= baseline.y - 0.025 - 1e-8 &&
        piston.position.y <= baseline.y,
    );
    assert.ok(piston.position.toArray().every(Number.isFinite));
  }
  state = undefined;
  s.controller.press("right");
  s.avatar.update((time += 0.05));
  assert.deepEqual(piston.position, baseline);
  state = { phase: "cooldown" };
  s.avatar.update((time += 0.05));
  assert.deepEqual(piston.position, baseline);
  s.dispose();
});

test("accepted simulation time freezes a reeling mechanism during paused state and advances only with accepted ticks", async () => {
  let state: FieldToolPresentation = { phase: "reeling", time: 3 };
  const s = await setup(() => state);
  await s.equip("wield-tether-winch");
  const spool = s.controller.getHand("right")!.anchor("spool");
  s.avatar.update(0.1);
  state = { phase: "reeling", time: 3.05 };
  s.avatar.update(0.15);
  const active = spool.quaternion.clone();
  for (let i = 0; i < 5; i++) s.avatar.update(0.2 + i * 0.05);
  assert.deepEqual(spool.quaternion.toArray(), active.toArray());
  state = { phase: "reeling", time: 3.1 };
  s.avatar.update(0.5);
  assert.ok(spool.quaternion.angleTo(active) > 0.01);
  s.dispose();
});
