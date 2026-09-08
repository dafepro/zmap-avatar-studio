import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary, type Motion } from "../src/runtime";
import { defaultRecipe, type Catalog } from "../src/core";
import {
  WIELD_LIMITS,
  emptyWieldLoadout,
  type WieldCatalog,
} from "../src/wield-core";
import {
  WieldController,
  WieldLibrary,
  type WieldEvent,
} from "../src/wield-runtime";
import { playfulWieldBehaviors } from "../src/wield-behaviors";
import "./helpers/node-image";

const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const equipment: WieldCatalog = JSON.parse(
  await readFile(
    new URL("../public/wield/catalog.json", import.meta.url),
    "utf8",
  ),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("../public" + new URL(String(input)).pathname, import.meta.url),
    ),
  );
async function setup(left: string | null, right: string | null = null) {
  const avatars = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    library = new WieldLibrary(
      equipment,
      "https://assets.test/wield/",
      fetcher,
    ),
    avatar = avatars.create();
  await avatar.setAppearance(defaultRecipe(catalog));
  const events: WieldEvent[] = [],
    errors: unknown[] = [];
  const controller = new WieldController(
    avatar,
    library,
    playfulWieldBehaviors(),
    {
      onEvent: (event) => events.push(event),
      onError: (error) => errors.push(error),
    },
  );
  const loadout = (l: string | null, r: string | null = null) => ({
    ...emptyWieldLoadout(equipment),
    left: l,
    right: r,
  });
  await controller.setLoadout(loadout(left, right));
  let time = 0;
  avatar.update(time);
  const step = (dt = 1 / 60, motion: Motion = {}) => {
    time += dt;
    avatar.update(time, motion);
  };
  const advance = (seconds: number, motion: Motion = {}) => {
    const frames = Math.ceil(seconds * 60);
    for (let i = 0; i < frames; i++) step(seconds / frames, motion);
  };
  const close = () => {
    controller.dispose();
    avatar.dispose();
    avatars.dispose();
    library.dispose();
  };
  return {
    avatars,
    avatar,
    library,
    controller,
    events,
    errors,
    step,
    advance,
    close,
    loadout,
  };
}
function instances(root: THREE.Object3D) {
  const found: THREE.InstancedMesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.InstancedMesh) found.push(node);
  });
  return found;
}
function instanceWorld(mesh: THREE.InstancedMesh, index = 0) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3()
    .setFromMatrixPosition(matrix)
    .applyMatrix4(mesh.matrixWorld);
}
function ribbonCenter(mesh: THREE.Mesh, row = 0) {
  const position = mesh.geometry.getAttribute("position");
  return new THREE.Vector3()
    .fromBufferAttribute(position, row * 2)
    .add(new THREE.Vector3().fromBufferAttribute(position, row * 2 + 1))
    .multiplyScalar(0.5)
    .applyMatrix4(mesh.matrixWorld);
}

test("Bubble Comet holds to emit, releases without new emission, and leaves moving bubbles in world space", async (t) => {
  const s = await setup("wield-bubble-comet");
  t.after(s.close);
  const held = s.controller.getHand("left")!,
    pool = instances(held.effects)[0],
    geometry = pool.geometry;
  assert.equal(pool.count, 0);
  s.controller.press("left");
  s.advance(0.35);
  assert.equal(s.events.filter((event) => event.type === "bubble").length, 1);
  assert.ok(pool.count > 0);
  const before = instanceWorld(pool),
    wristBefore = held.anchor("grip").getWorldPosition(new THREE.Vector3());
  s.avatar.object.position.x += 1.25;
  s.avatar.object.rotation.y += 0.6;
  s.step(0.01);
  assert.ok(
    held
      .anchor("grip")
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(wristBefore) > 1,
  );
  assert.ok(
    instanceWorld(pool).distanceTo(before) < 0.02,
    "already-emitted bubbles must not travel with the wrist",
  );
  const emitted = s.events.length;
  s.controller.release("left");
  s.advance(0.5);
  assert.equal(s.events.length, emitted);
  s.controller.cancel("left");
  assert.equal(pool.count, 0);
  s.controller.press("left");
  s.advance(3);
  assert.ok(pool.count <= 6);
  assert.equal(pool.geometry, geometry);
  assert.equal(s.controller.diagnostics().effectTriangles, 216);
  assert.deepEqual(s.errors, []);
});

test("Bonk Bouquet has one delayed impact, a bounded swing, a cooldown, and cancellable windup", async (t) => {
  const s = await setup("wield-bonk-bouquet");
  t.after(s.close);
  const forearm = s.avatar.attachmentView()!.sockets.get("forearm_L")!,
    rest = forearm.rotation.x;
  s.controller.press("left");
  s.advance(0.25);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].type, "bonk");
  assert.equal(s.events[0].value, 1);
  assert.ok(s.events[0].position?.every(Number.isFinite));
  assert.ok(Math.abs(forearm.rotation.x - rest) > 0.3);
  const pool = instances(s.controller.getHand("left")!.effects)[0];
  assert.equal(pool.count, 10);
  s.controller.release("left");
  s.controller.press("left");
  s.advance(0.35);
  assert.equal(
    s.events.length,
    1,
    "pressing during cooldown cannot create another impact",
  );
  s.controller.release("left");
  s.advance(0.15);
  s.controller.press("left");
  s.advance(0.25);
  assert.equal(s.events.length, 2);
  s.controller.release("left");
  s.advance(0.75);
  s.controller.press("left");
  s.advance(0.1);
  s.controller.cancel("left");
  s.advance(0.6);
  assert.equal(s.events.length, 2);
  assert.equal(pool.count, 0);
  assert.ok(Math.abs(forearm.rotation.x - rest) < 1e-8);
  assert.deepEqual(s.errors, []);
});

test("Firefly Lantern toggles independently and retains its state through cancel, pause, inspection, and appearance swaps", async (t) => {
  const s = await setup("wield-firefly-lantern", "wield-firefly-lantern");
  t.after(s.close);
  const left = s.controller.getHand("left")!,
    right = s.controller.getHand("right")!;
  const light = (root: THREE.Object3D) => {
    let result!: THREE.PointLight;
    root.traverse((node) => {
      if (node instanceof THREE.PointLight) result = node;
    });
    return result;
  };
  const a = light(left.effects),
    b = light(right.effects),
    flies = instances(left.effects)[0];
  assert.equal(a.intensity, 0);
  assert.equal(b.intensity, 0);
  s.controller.press("left");
  s.controller.release("left");
  s.advance(0.1);
  assert.ok(a.intensity > 0 && a.intensity <= 1);
  assert.equal(a.castShadow, false);
  assert.ok(a.distance <= 1);
  assert.equal(b.intensity, 0);
  assert.deepEqual(
    s.events.map((event) => [event.hand, event.type, event.value]),
    [["left", "light", 1]],
  );
  const orbit = instanceWorld(flies);
  s.advance(0.1);
  assert.ok(instanceWorld(flies).distanceTo(orbit) > 0.005);
  s.advance(0.1, { reducedMotion: true });
  const still = instanceWorld(flies);
  s.advance(0.2, { reducedMotion: true });
  assert.ok(
    instanceWorld(flies).distanceTo(still) < 1e-6,
    "reduced motion retains a static illuminated state",
  );
  s.controller.cancel("left");
  s.controller.setPaused(true);
  s.advance(0.1);
  assert.ok(a.intensity > 0);
  s.controller.setVisible(false);
  await s.avatar.setAppearance({ ...s.avatar.recipe!, body: { weight: 0.6 } });
  s.advance(0.2);
  assert.equal(s.avatar.object.getObjectById(a.id), undefined);
  s.controller.setVisible(true);
  s.controller.setPaused(false);
  s.step();
  assert.equal(s.controller.getHand("left"), left);
  assert.equal(s.controller.getHand("right"), right);
  assert.ok(a.intensity > 0);
  s.controller.press("left");
  s.controller.release("left");
  s.controller.press("right");
  s.step();
  assert.equal(a.intensity, 0);
  assert.ok(b.intensity > 0);
  assert.deepEqual(
    s.events.map((event) => event.value),
    [1, 0, 1],
  );
  assert.deepEqual(s.errors, []);
});

test("Doodle Rocket keeps its existing ribbon in world space, bounds its history, expires, and cancels", async (t) => {
  const s = await setup("wield-doodle-rocket");
  t.after(s.close);
  const held = s.controller.getHand("left")!,
    ribbon = held.effects.getObjectByName(
      "Temporary doodle ribbon",
    ) as THREE.Mesh;
  s.controller.press("left");
  s.advance(0.45);
  assert.ok(ribbon.geometry.drawRange.count >= 6);
  assert.ok(s.events.some((event) => event.type === "ink-point"));
  s.controller.release("left");
  const world = ribbonCenter(ribbon);
  s.avatar.object.position.x += 1.2;
  s.avatar.object.rotation.y += 0.5;
  s.step(0.01);
  assert.ok(
    ribbonCenter(ribbon).distanceTo(world) < 1e-6,
    "released marks do not rotate or translate with a moving wrist",
  );
  s.advance(1.8);
  assert.equal(ribbon.geometry.drawRange.count, 0);
  s.controller.press("left");
  s.advance(3);
  assert.ok(ribbon.geometry.getAttribute("position").count <= 64);
  assert.ok(ribbon.geometry.index!.count <= 186);
  assert.ok(ribbon.geometry.drawRange.count <= 186);
  s.controller.cancel("left");
  assert.equal(ribbon.geometry.drawRange.count, 0);
  s.controller.press("left");
  s.advance(0.3);
  s.avatar.object.position.x += 2;
  s.step(0.05);
  assert.equal(
    ribbon.geometry.drawRange.count,
    0,
    "a teleport starts a new ribbon instead of bridging the world",
  );
  assert.deepEqual(s.errors, []);
});

test("Whirl Pop accelerates while held, coasts on release, stops on cancel, and restores its authored rotor", async (t) => {
  const s = await setup("wield-whirl-pop");
  t.after(s.close);
  const rotor = s.controller.getHand("left")!.anchor("rotor"),
    rest = rotor.quaternion.clone();
  s.controller.press("left");
  s.advance(0.3);
  assert.ok(rotor.quaternion.angleTo(rest) > 0.1);
  s.controller.release("left");
  const before = rotor.quaternion.clone();
  s.step(0.02);
  const firstCoast = rotor.quaternion.angleTo(before);
  assert.ok(firstCoast > 0.02);
  s.advance(1);
  const later = rotor.quaternion.clone();
  s.step(0.02);
  const lastCoast = rotor.quaternion.angleTo(later);
  assert.ok(
    lastCoast < firstCoast * 0.15,
    "the released rotor must lose speed",
  );
  s.controller.cancel("left");
  const stopped = rotor.quaternion.clone();
  s.advance(0.2);
  assert.ok(rotor.quaternion.angleTo(stopped) < 1e-7);
  s.controller.press("left");
  s.advance(0.2, { reducedMotion: true });
  assert.ok(rotor.quaternion.angleTo(rest) < 1e-7);
  assert.deepEqual(
    s.events.map((event) => event.type),
    ["spin-start", "spin-release", "spin-start"],
  );
  s.controller.dispose();
  assert.ok(rotor.quaternion.angleTo(rest) < 1e-7);
  assert.deepEqual(s.errors, []);
});

test("reduced motion suppresses bubble/ribbon animation while preserving the discrete bonk intent", async (t) => {
  const s = await setup("wield-bubble-comet", "wield-doodle-rocket");
  t.after(s.close);
  s.controller.press("left");
  s.controller.press("right");
  s.advance(0.8, { reducedMotion: true });
  assert.equal(s.events.length, 0);
  assert.equal(instances(s.controller.getHand("left")!.effects)[0].count, 0);
  const ribbon = s.controller
    .getHand("right")!
    .effects.getObjectByName("Temporary doodle ribbon") as THREE.Mesh;
  assert.equal(ribbon.geometry.drawRange.count, 0);
  await s.controller.setLoadout(s.loadout("wield-bonk-bouquet"));
  s.controller.press("left");
  s.advance(0.3, { reducedMotion: true });
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].type, "bonk");
  assert.equal(instances(s.controller.getHand("left")!.effects)[0].count, 0);
  assert.deepEqual(s.errors, []);
});

test("all25 built-in pairs stay within effect capacity and release every owned resource exactly once", async (t) => {
  const s = await setup(null);
  t.after(s.close);
  const watched = new Map<object, number>();
  let maximum = 0;
  for (const left of equipment.items)
    for (const right of equipment.items) {
      await s.controller.setLoadout(s.loadout(left.id, right.id));
      for (const hand of ["left", "right"] as const) {
        const held = s.controller.getHand(hand)!;
        for (const root of [held.object, held.grip, held.effects])
          root.traverse((node) => {
            const resources: any[] = [];
            if (node instanceof THREE.Mesh)
              resources.push(
                node.geometry,
                ...(Array.isArray(node.material)
                  ? node.material
                  : [node.material]),
              );
            if (
              node instanceof THREE.InstancedMesh ||
              node instanceof THREE.Light
            )
              resources.push(node);
            for (const resource of resources)
              if (!watched.has(resource)) {
                watched.set(resource, 0);
                if (resource instanceof THREE.Light) {
                  const originalDispose = resource.dispose.bind(resource);
                  resource.dispose = () => {
                    watched.set(resource, watched.get(resource)! + 1);
                    originalDispose();
                  };
                } else
                  resource.addEventListener("dispose", () =>
                    watched.set(resource, watched.get(resource)! + 1),
                  );
              }
          });
      }
      s.controller.press("left");
      s.controller.press("right");
      s.advance(1.1);
      const diagnostic = s.controller.diagnostics();
      maximum = Math.max(maximum, diagnostic.effectTriangles);
      assert.ok(diagnostic.effectTriangles <= WIELD_LIMITS.effects);
      assert.ok(diagnostic.visibleTriangles <= WIELD_LIMITS.visible);
      assert.equal(s.controller.getHand("left")!.state, "ready");
      assert.equal(s.controller.getHand("right")!.state, "ready");
    }
  s.controller.dispose();
  s.avatar.dispose();
  s.library.dispose();
  s.avatars.dispose();
  assert.equal(maximum, 432);
  assert.ok(watched.size > 100);
  assert.ok(
    [...watched.values()].every((count) => count === 1),
    "effect callbacks and controller ownership must not double-dispose or leak",
  );
  assert.deepEqual(s.errors, []);
});

test("changing the opposite toy retains a lit lantern and a continuously held bubble wand", async (t) => {
  const s = await setup("wield-firefly-lantern", "wield-whirl-pop");
  t.after(s.close);
  s.controller.press("left");
  s.controller.release("left");
  s.step();
  const lantern = s.controller.getHand("left")!;
  let light!: THREE.PointLight;
  lantern.effects.traverse((node) => {
    if (node instanceof THREE.PointLight) light = node;
  });
  assert.ok(light.intensity > 0);
  await s.controller.setLoadout(
    s.loadout("wield-firefly-lantern", "wield-doodle-rocket"),
  );
  s.step();
  assert.equal(s.controller.getHand("left"), lantern);
  assert.ok(light.intensity > 0);
  assert.equal(s.events.filter((event) => event.type === "light").length, 1);
  await s.controller.setLoadout(
    s.loadout("wield-bubble-comet", "wield-doodle-rocket"),
  );
  const wand = s.controller.getHand("left")!;
  s.controller.press("left");
  s.advance(0.2);
  await s.controller.setLoadout(
    s.loadout("wield-bubble-comet", "wield-whirl-pop"),
  );
  s.advance(0.2);
  assert.equal(s.controller.getHand("left"), wand);
  assert.ok(
    s.events.some((event) => event.type === "bubble"),
    "emission credit and held input survive changing the opposite hand",
  );
  assert.deepEqual(s.errors, []);
});
