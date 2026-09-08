import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary, type AvatarInstance } from "../src/runtime";
import { defaultRecipe, type Catalog, type Recipe } from "../src/core";
import {
  HANDS,
  WIELD_LIMITS,
  emptyWieldLoadout,
  type Hand,
  type WieldCatalog,
} from "../src/wield-core";
import { WieldController, WieldLibrary } from "../src/wield-runtime";
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

function ancestorData(object: THREE.Object3D, key: string): unknown {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData[key] !== undefined) return current.userData[key];
    current = current.parent;
  }
  return undefined;
}

function bodyMeshes(avatar: AvatarInstance, hand?: Hand) {
  const result: THREE.Mesh[] = [];
  avatar.object.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.comicOutline) return;
    if (ancestorData(object, "assetId") !== catalog.base) return;
    const side = ancestorData(object, "handSide");
    if (hand ? side === hand : side === undefined) result.push(object);
  });
  return result;
}

function worldVertices(mesh: THREE.Mesh) {
  if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
  return Array.from(
    { length: mesh.geometry.getAttribute("position").count },
    (_, index) =>
      mesh
        .getVertexPosition(index, new THREE.Vector3())
        .applyMatrix4(mesh.matrixWorld),
  );
}

function visible(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function triangleCount(root: THREE.Object3D, onlyVisible = false) {
  let triangles = 0;
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object.userData.comicOutline ||
      (onlyVisible && !visible(object))
    )
      return;
    triangles +=
      (object.geometry.index?.count ??
        object.geometry.getAttribute("position").count) / 3;
  });
  return triangles;
}

function wrist(avatar: AvatarInstance, hand: Hand) {
  const bone = avatar.object.getObjectByName(
    hand === "left" ? "hand_L" : "hand_R",
  );
  assert.ok(
    bone instanceof THREE.Bone,
    `${hand} wrist must be a shared rig bone`,
  );
  return bone;
}

function assertGripFrame(
  avatar: AvatarInstance,
  controller: WieldController,
  hand: Hand,
  label: string,
) {
  const held = controller.getHand(hand);
  assert.ok(held, `${label}: item is mounted`);
  assert.equal(held.state, "ready", `${label}: item is ready`);
  avatar.object.updateMatrixWorld(true);
  const anchor = held.anchor("grip"),
    frame = equipment.grips[hand].frame,
    expected = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(...frame.position),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(...frame.rotation, "XYZ"),
        ),
        new THREE.Vector3(1, 1, 1),
      )
      .premultiply(wrist(avatar, hand).matrixWorld);
  const expectedPosition = new THREE.Vector3().setFromMatrixPosition(expected),
    actualPosition = anchor.getWorldPosition(new THREE.Vector3());
  assert.ok(
    actualPosition.distanceTo(expectedPosition) < 0.002,
    `${label}: item grip anchor drifted from the palm`,
  );
  // A reflected or incorrectly rolled item can share an anchor position. Check
  // the complete proper basis, including each axis, independently of runtime.
  for (let column = 0; column < 3; column++) {
    const a = new THREE.Vector3().setFromMatrixColumn(
        anchor.matrixWorld,
        column,
      ),
      b = new THREE.Vector3().setFromMatrixColumn(expected, column);
    assert.ok(
      Math.abs(a.length() - 1) < 1e-5,
      `${label}: grip axis must not scale`,
    );
    assert.ok(
      a.normalize().distanceTo(b.normalize()) < 1e-5,
      `${label}: grip axis ${column} disagrees`,
    );
  }
  for (const root of [held.object, held.grip])
    root.traverse((object) => {
      assert.ok(
        object.scale.x > 0 && object.scale.y > 0 && object.scale.z > 0,
        `${label}: positive local scale`,
      );
      assert.ok(
        object.matrixWorld.determinant() > 0,
        `${label}: proper world transform`,
      );
    });
  return held;
}

/** The actual grip's upper ring must overlap the forearm surface. Compare with
 * forearm triangles only, so an invisible relaxed hand cannot conceal a seam. */
function wristSeam(avatar: AvatarInstance, grip: THREE.Object3D, hand: Hand) {
  const inverse = wrist(avatar, hand).matrixWorld.clone().invert(),
    samples: THREE.Vector3[] = [],
    triangles: THREE.Triangle[] = [];
  grip.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const point of worldVertices(object)) {
      point.applyMatrix4(inverse);
      if (point.y >= 0.014) samples.push(point);
    }
  });
  for (const mesh of bodyMeshes(avatar)) {
    const points = worldVertices(mesh).map((point) =>
        point.applyMatrix4(inverse),
      ),
      index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? points.length); i += 3) {
      const a = points[index?.getX(i) ?? i],
        b = points[index?.getX(i + 1) ?? i + 1],
        c = points[index?.getX(i + 2) ?? i + 2];
      if (
        [a, b, c].some(
          (point) =>
            Math.abs(point.x) < 0.1 &&
            point.y > -0.04 &&
            point.y < 0.09 &&
            Math.abs(point.z) < 0.1,
        )
      )
        triangles.push(new THREE.Triangle(a, b, c));
    }
  }
  assert.ok(samples.length >= 8, "actual grip contains its full wrist ring");
  assert.ok(
    triangles.length > 8,
    "actual body contains the forearm seam surface",
  );
  const nearest = new THREE.Vector3();
  return Math.max(
    ...samples.map((point) =>
      Math.min(
        ...triangles.map((triangle) =>
          triangle.closestPointToPoint(point, nearest).distanceTo(point),
        ),
      ),
    ),
  );
}

function handSnapshot(avatar: AvatarInstance) {
  avatar.object.updateMatrixWorld(true);
  return Object.fromEntries(
    HANDS.map((hand) => [
      hand,
      bodyMeshes(avatar, hand).map((mesh) => ({
        visible: visible(mesh),
        attributes: Object.fromEntries(
          Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [
            name,
            Array.from(attribute.array),
          ]),
        ),
        index: mesh.geometry.index
          ? Array.from(mesh.geometry.index.array)
          : null,
        world: worldVertices(mesh).map((point) => point.toArray()),
      })),
    ]),
  );
}

function setup() {
  const appearance = new AvatarLibrary(
      catalog,
      "https://assets.test/",
      fetcher,
    ),
    library = new WieldLibrary(
      equipment,
      "https://assets.test/wield/",
      fetcher,
    ),
    avatar = appearance.create(),
    errors: unknown[] = [],
    registry = Object.fromEntries(
      equipment.items.map((item) => [item.behavior, { create: () => ({}) }]),
    ),
    controller = new WieldController(avatar, library, registry, {
      onError: (error) => errors.push(error),
    });
  return {
    appearance,
    library,
    avatar,
    controller,
    errors,
    dispose() {
      controller.dispose();
      avatar.dispose();
      library.dispose();
      appearance.dispose();
    },
  };
}

test("each exported item aligns its complete grip basis on both hands, three weights and four motions", async () => {
  const context = setup();
  let cases = 0,
    poses = 0,
    worstSeam = 0;
  try {
    assert.equal(
      equipment.items.length,
      5,
      "the promised five original wield items are present",
    );
    for (const weight of [-1, 0, 1]) {
      const recipe = defaultRecipe(catalog);
      recipe.body = { weight };
      await context.avatar.setAppearance(recipe);
      for (const hand of HANDS)
        for (const item of equipment.items) {
          const loadout = emptyWieldLoadout(equipment);
          loadout[hand] = item.id;
          await context.controller.setLoadout(loadout);
          const originals = bodyMeshes(context.avatar, hand);
          assert.ok(
            originals.length > 0,
            "relaxed hands have explicit side metadata",
          );
          assert.ok(
            originals.every((mesh) => !visible(mesh)),
            "the equipped relaxed hand is covered",
          );
          const free = bodyMeshes(
            context.avatar,
            hand === "left" ? "right" : "left",
          );
          assert.ok(
            free.length > 0,
            "the free hand retains its tagged anatomy",
          );
          assert.ok(
            free.every(visible),
            "equipping one hand preserves the other relaxed hand",
          );
          for (const gesture of ["idle", "walk", "run", "wave"] as const) {
            for (const time of [0, 0.13, 0.47]) {
              context.avatar.update(time, { gesture });
              const held = assertGripFrame(
                context.avatar,
                context.controller,
                hand,
                `${item.id}/${hand}/${weight}/${gesture}/${time}`,
              );
              if (item.id === "wield-firefly-lantern") {
                // A mathematically aligned grip may still encode an upside-down
                // carry frame. Qualify the intended model orientation separately.
                const source = held.object.getObjectByName(item.node)!;
                const up = new THREE.Vector3(0, 1, 0).transformDirection(
                  source.matrixWorld,
                );
                assert.ok(up.y > 0.99, `${hand} lantern must hang upright`);
                const core = held
                  .anchor("core")
                  .getWorldPosition(new THREE.Vector3());
                const grip = held
                  .anchor("grip")
                  .getWorldPosition(new THREE.Vector3());
                assert.ok(
                  core.y < grip.y - 0.19,
                  "lantern body hangs below its carrying handle",
                );
              }
              const gap = wristSeam(context.avatar, held.grip, hand);
              worstSeam = Math.max(worstSeam, gap);
              assert.ok(
                gap < 0.012,
                `grip wrist must overlap its forearm: ${gap.toFixed(5)} m`,
              );
              poses++;
            }
          }
          cases++;
        }
    }
    assert.equal(cases, 30);
    assert.equal(poses, 360);
    assert.deepEqual(context.errors, []);
    console.info(
      `Wield fit: ${cases} assemblies, ${poses} moving poses; maximum wrist surface distance ${(worstSeam * 1000).toFixed(3)} mm`,
    );
  } finally {
    context.dispose();
  }
});

test("unequipping restores exact relaxed hands and appearance swaps retain both held objects", async () => {
  const context = setup();
  try {
    const recipe = defaultRecipe(catalog);
    await context.avatar.setAppearance(recipe);
    context.avatar.update(0, { gesture: "idle", reducedMotion: true });
    const original = handSnapshot(context.avatar),
      loadout = emptyWieldLoadout(equipment);
    for (const hand of HANDS)
      loadout[hand] = equipment.items[hand === "left" ? 0 : 1].id;
    await context.controller.setLoadout(loadout);
    const objects = HANDS.map(
      (hand) => context.controller.getHand(hand)!.object,
    );
    for (const [index, weight] of [-1, 1, 0].entries()) {
      const changed: Recipe = structuredClone(recipe);
      changed.body = { weight };
      changed.parts.head = index % 2 ? "head-scout" : "head-spark";
      changed.parts.shirt = index % 2 ? "shirt-tide" : "shirt-hoodie";
      changed.colors.skin = index % 2 ? "#855538" : "#edc39d";
      await context.avatar.setAppearance(changed);
      context.avatar.update(index + 1, {
        gesture: "wave",
        reducedMotion: true,
      });
      for (const [i, hand] of HANDS.entries()) {
        const held = assertGripFrame(
          context.avatar,
          context.controller,
          hand,
          `appearance replacement ${index}/${hand}`,
        );
        assert.equal(
          held.object,
          objects[i],
          "appearance changes retain held objects and their behavior state",
        );
        assert.ok(
          bodyMeshes(context.avatar, hand).every((mesh) => !visible(mesh)),
          "replacement anatomy cannot leak a relaxed hand beside the grip",
        );
      }
    }
    await context.avatar.setAppearance(recipe);
    await context.controller.setLoadout(emptyWieldLoadout(equipment));
    context.avatar.update(0, { gesture: "idle", reducedMotion: true });
    assert.deepEqual(
      handSnapshot(context.avatar),
      original,
      "unequipping restores untouched geometry, visibility and neutral pose",
    );
    assert.equal(context.controller.getHand("left"), undefined);
    assert.equal(context.controller.getHand("right"), undefined);
    assert.deepEqual(context.errors, []);
  } finally {
    context.dispose();
  }
});

test("the heaviest appearance with every two-item pair respects source, held and visible limits", async () => {
  const context = setup();
  let worstVisible = 0,
    worstHeld = 0;
  try {
    const recipe = defaultRecipe(catalog);
    for (const slot of catalog.slots)
      recipe.parts[slot.id] = catalog.assets
        .filter((asset) => asset.slot === slot.id)
        .sort((a, b) => b.triangles - a.triangles)[0]!.id;
    recipe.body = { weight: 1 };
    await context.avatar.setAppearance(recipe);
    assert.ok(
      context.avatar.diagnostics().sourceTriangles <=
        catalog.budgets.maxTriangles,
    );
    for (const grip of Object.values(equipment.grips))
      assert.ok(grip.triangles <= WIELD_LIMITS.grip);
    for (const item of equipment.items)
      assert.ok(item.triangles <= WIELD_LIMITS.item);
    for (const left of equipment.items)
      for (const right of equipment.items) {
        await context.controller.setLoadout({
          ...emptyWieldLoadout(equipment),
          left: left.id,
          right: right.id,
        });
        context.avatar.update(1, { gesture: "idle", reducedMotion: true });
        let heldTriangles = 0;
        for (const hand of HANDS) {
          const held = assertGripFrame(
            context.avatar,
            context.controller,
            hand,
            `${left.id}/${right.id}/${hand}`,
          );
          const itemTriangles = triangleCount(held.object),
            gripTriangles = triangleCount(held.grip);
          assert.ok(itemTriangles <= WIELD_LIMITS.item);
          assert.ok(gripTriangles <= WIELD_LIMITS.grip);
          assert.equal(gripTriangles, equipment.grips[hand].triangles);
          heldTriangles += itemTriangles + gripTriangles;
        }
        const heldBytes =
            left.bytes +
            right.bytes +
            equipment.grips.left.bytes +
            equipment.grips.right.bytes,
          visibleTriangles = triangleCount(context.avatar.object, true);
        worstHeld = Math.max(worstHeld, heldTriangles);
        worstVisible = Math.max(worstVisible, visibleTriangles);
        assert.ok(heldTriangles <= WIELD_LIMITS.held);
        assert.ok(heldBytes <= WIELD_LIMITS.heldBytes);
        assert.ok(visibleTriangles <= WIELD_LIMITS.visible);
      }
    assert.deepEqual(context.errors, []);
    console.info(
      `Wield maximum: ${worstHeld} held / ${worstVisible} visible triangles across all 25 item pairs`,
    );
  } finally {
    context.dispose();
  }
});
