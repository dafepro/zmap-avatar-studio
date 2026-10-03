import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  validateCatalog,
  validateRecipe,
  type Catalog,
  type Recipe,
} from "../src";
import { parseLook } from "../app/atelier-state";
import { type WieldCatalog } from "../src/wield-core";
import "./helpers/node-image";

const root = new URL("../public/", import.meta.url);
const catalog: Catalog = JSON.parse(
  await readFile(new URL("capsule/catalog.json", root), "utf8"),
);
const manifest = JSON.parse(
  await readFile(new URL("capsule/sets/sunline-courier.json", root), "utf8"),
);
const components = manifest.components as {
  slot: string;
  id: string;
  label: string;
}[];
const ids = components.map((part) => part.id);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(new URL("capsule" + new URL(String(input)).pathname, root)),
  );
const fullRecipe = () => {
  const recipe = defaultRecipe(catalog);
  Object.assign(
    recipe.parts,
    Object.fromEntries(components.map((part) => [part.slot, part.id])),
  );
  Object.assign(recipe.colors, manifest.palette);
  return recipe;
};
function meshes(root: THREE.Object3D, selected: readonly string[]) {
  const result: THREE.Mesh[] = [];
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.comicOutline) return;
    let owner: THREE.Object3D | null = object;
    while (owner && !owner.userData.assetId) owner = owner.parent;
    if (owner && selected.includes(owner.userData.assetId)) result.push(object);
  });
  return result;
}
function vertices(mesh: THREE.Mesh) {
  if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
  return Array.from(
    { length: mesh.geometry.attributes.position.count },
    (_, index) =>
      mesh
        .getVertexPosition(index, new THREE.Vector3())
        .applyMatrix4(mesh.matrixWorld),
  );
}
function rest(avatar: ReturnType<AvatarLibrary["create"]>) {
  const view = avatar.attachmentView()!;
  for (const bone of view.sockets.values()) bone.quaternion.identity();
  view.root.position.set(0, 0, 0);
  avatar.object.updateMatrixWorld(true);
}

test("Sunline is a standalone five-piece collection and valid importable SHIFT look", async () => {
  validateCatalog(catalog);
  assert.equal(manifest.format, "shift-collectible-set");
  assert.equal(manifest.version, 1);
  assert.deepEqual(
    components.map((part) => part.slot),
    ["headwear", "shirt", "bottom", "shoes", "accessory"],
  );
  assert.equal(new Set(ids).size, 5);
  let triangles = 0,
    bytes = 0;
  for (const component of components) {
    const descriptor = JSON.parse(
      await readFile(
        new URL(`capsule/parts/${component.id}.json`, root),
        "utf8",
      ),
    );
    assert.equal(descriptor.id, component.id);
    assert.equal(descriptor.slot, component.slot);
    assert.equal(descriptor.label, component.label);
    assert.equal(descriptor.rig, "athlete-reference-v2");
    const data = await readFile(new URL(`capsule/${descriptor.url}`, root));
    assert.equal(data.length, descriptor.bytes);
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      descriptor.sha256,
    );
    triangles += descriptor.triangles;
    bytes += descriptor.bytes;
  }
  assert.ok(triangles <= 2800);
  assert.ok(bytes < 300000);
  const wield: WieldCatalog = JSON.parse(
    await readFile(new URL("wield/catalog.json", root), "utf8"),
  );
  const look = parseLook(
    await readFile(
      new URL(
        manifest.look,
        new URL("capsule/sets/sunline-courier.json", root),
      ),
      "utf8",
    ),
    catalog,
    wield,
  );
  for (const component of components)
    assert.equal(look.appearance.parts[component.slot], component.id);
  for (const [channel, value] of Object.entries(manifest.palette))
    assert.equal(look.appearance.colors[channel], value);
  assert.deepEqual(look.equipment.left, null);
  assert.deepEqual(look.equipment.right, null);
});

test("each Sunline piece selects and replaces independently with legacy components", async () => {
  const library = new AvatarLibrary(catalog, "https://sunline.test/", fetcher),
    avatar = library.create();
  try {
    for (const component of components) {
      const recipe = defaultRecipe(catalog),
        before = structuredClone(recipe);
      recipe.parts[component.slot] = component.id;
      validateRecipe(recipe, catalog);
      await avatar.setAppearance(recipe);
      assert.ok(meshes(avatar.object, [component.id]).length);
      assert.equal(
        avatar.diagnostics().parts,
        Object.values(recipe.parts).filter(Boolean).length + 1,
      );
      assert.deepEqual(recipe.colors, before.colors);
      await avatar.setAppearance(before);
      assert.equal(meshes(avatar.object, [component.id]).length, 0);
    }
  } finally {
    avatar.dispose();
    library.dispose();
  }
});

test("complete Sunline fits both heads, three builds and every legacy hair with all optional slots inside unchanged budgets", async () => {
  const library = new AvatarLibrary(catalog, "https://sunline.test/", fetcher);
  let maximum = 0;
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1])
        for (const hair of catalog.assets.filter(
          (part) => part.slot === "hair",
        )) {
          const avatar = library.create();
          try {
            const recipe = fullRecipe();
            Object.assign(recipe.parts, {
              head,
              hair: hair.id,
              face: "face-volt",
              facialHair: "facial-mustache",
              eyewear: "acc-glasses",
              effect: "effect-orbit",
            });
            recipe.body = { weight };
            validateRecipe(recipe, catalog);
            await avatar.setAppearance(recipe);
            rest(avatar);
            const report = avatar.diagnostics();
            assert.equal(report.parts, 12);
            assert.ok(report.sourceTriangles <= 14000);
            maximum = Math.max(maximum, report.sourceTriangles);
            const byteCount = catalog.assets
              .filter(
                (part) =>
                  part.id === catalog.base ||
                  Object.values(recipe.parts).includes(part.id),
              )
              .reduce((total, part) => total + part.bytes, 0);
            assert.ok(byteCount <= 1500000);
            for (const mesh of meshes(avatar.object, ids))
              for (const point of vertices(mesh))
                assert.ok(point.toArray().every(Number.isFinite));
          } finally {
            avatar.dispose();
          }
        }
    console.log("SUNLINE_MAX_FITTED_TRIANGLES", maximum);
  } finally {
    library.dispose();
  }
});

test("long sleeves, full trousers, socks and rigid trainers retain anatomical weights and shared mixing envelope", async () => {
  const library = new AvatarLibrary(catalog, "https://sunline.test/", fetcher),
    avatar = library.create();
  try {
    await avatar.setAppearance(fullRecipe());
    rest(avatar);
    let lowerPants = 0,
      ankleFabric = 0,
      rigidSole = 0,
      blendedShoulder = 0;
    for (const id of ids)
      for (const mesh of meshes(avatar.object, [id])) {
        if (!(mesh instanceof THREE.SkinnedMesh)) continue;
        const points = vertices(mesh),
          indices = mesh.geometry.getAttribute("skinIndex"),
          weights = mesh.geometry.getAttribute("skinWeight");
        for (let index = 0; index < points.length; index++) {
          const point = points[index],
            side = point.x < 0 ? "L" : "R",
            influence: Record<string, number> = {};
          let total = 0;
          for (let i = 0; i < 4; i++) {
            const weight = weights.getComponent(index, i);
            assert.ok(Number.isFinite(weight) && weight >= 0);
            total += weight;
            const name =
              mesh.skeleton.bones[indices.getComponent(index, i)].name;
            influence[name] = (influence[name] ?? 0) + weight;
          }
          assert.ok(Math.abs(total - 1) < 0.002);
          if (id === "bottom-sunline-cargo") {
            assert.ok(
              point.y >= 0.28 - 1e-5,
              "pants never enter rigid-shoe envelope",
            );
            if (point.y < 0.49) {
              assert.ok((influence[`shin_${side}`] ?? 0) > 0.999);
              lowerPants++;
            }
          }
          if (id === "shoes-sunline-track") {
            if ((influence[`foot_${side}`] ?? 0) > 0.999) {
              assert.ok(point.y <= 0.26 + 1e-5);
              if (point.y < 0.035) rigidSole++;
            }
            if (point.y > 0.34) {
              assert.ok((influence[`shin_${side}`] ?? 0) > 0.999);
              ankleFabric++;
            }
          }
          if (
            id === "shirt-sunline-courier" &&
            (influence.chest ?? 0) > 0.02 &&
            (influence.arm_R ?? 0) > 0.02
          )
            blendedShoulder++;
          if (id === "acc-sunline-envelope")
            assert.ok(
              Object.entries(influence).every(
                ([bone, value]) =>
                  value === 0 || ["chest", "hips"].includes(bone),
              ),
              "pack cannot bind to arms",
            );
        }
      }
    assert.ok(
      lowerPants > 50 &&
        ankleFabric > 20 &&
        rigidSole > 30 &&
        blendedShoulder > 0,
    );
    const view = avatar.attachmentView()!,
      restBones = new Map(
        [...view.sockets].map(([id, bone]) => [
          id,
          { position: bone.position.clone(), scale: bone.scale.clone() },
        ]),
      );
    const owned = meshes(avatar.object, ids),
      before = owned.map(vertices);
    for (const weight of [-1, 0, 1]) {
      const recipe = fullRecipe();
      recipe.body = { weight };
      await avatar.setAppearance(recipe);
      rest(avatar);
      const selected = meshes(avatar.object, ids),
        original = selected.map(vertices);
      for (const motion of ["wave", "run"] as const)
        for (let frame = 0; frame <= 60; frame++) {
          avatar.update(
            frame / 60,
            motion === "wave"
              ? { emote: { id: "wave", elapsed: frame / 60 } }
              : { velocity: { x: 0, z: 3.8 }, grounded: true },
          );
          avatar.object.updateMatrixWorld(true);
          for (const [mi, mesh] of selected.entries()) {
            const posed = vertices(mesh),
              index = mesh.geometry.index;
            for (const point of posed)
              assert.ok(
                point.toArray().every(Number.isFinite) &&
                  point.y > -0.012 &&
                  point.y < 2.6 &&
                  Math.abs(point.x) < 1.5 &&
                  Math.abs(point.z) < 1.5,
              );
            for (let i = 0; i < (index?.count ?? posed.length); i += 3)
              for (let edge = 0; edge < 3; edge++) {
                const a = index?.getX(i + edge) ?? i + edge,
                  b = index?.getX(i + ((edge + 1) % 3)) ?? i + ((edge + 1) % 3);
                assert.ok(
                  posed[a].distanceTo(posed[b]) <=
                    original[mi][a].distanceTo(original[mi][b]) * 3 + 0.02,
                  `${motion} tears ${mesh.name}`,
                );
              }
          }
          for (const [id, bone] of avatar.attachmentView()!.sockets) {
            const previous = restBones.get(id)!;
            assert.ok(bone.position.distanceTo(previous.position) < 1e-6);
            assert.ok(bone.scale.distanceTo(previous.scale) < 1e-6);
          }
        }
    }
    assert.ok(owned.length && before.length);
  } finally {
    avatar.dispose();
    library.dispose();
  }
});
