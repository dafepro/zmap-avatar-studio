import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { syntheticHair } from "./helpers/procedural-hair";
import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  validateCatalog,
  validateRecipe,
  type Catalog,
  type Asset,
} from "../src";
import "./helpers/node-image";
const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("../public" + new URL(String(input)).pathname, import.meta.url),
    ),
  );
const partIds = (slot: string) =>
  catalog.assets
    .filter((asset) => asset.slot === slot)
    .map((asset) => asset.id);
const accessoryStates = () =>
  [null, ...partIds("headwear")].flatMap((headwear) =>
    [null, ...partIds("eyewear")]
      .filter((eyewear) => headwear !== null || eyewear !== null)
      .map((eyewear) => ({ headwear, eyewear })),
  );
function meshes(root: THREE.Object3D, id: string) {
  const result: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let p: THREE.Object3D | null = o;
    while (p && !p.userData.assetId) p = p.parent;
    if (p?.userData.assetId === id) result.push(o);
  });
  return result;
}
function geometrySnapshot(source: THREE.Mesh[]) {
  return source.map((mesh) => ({
    index: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
    attributes: Object.fromEntries(
      Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [
        name,
        {
          itemSize: attribute.itemSize,
          normalized: attribute.normalized,
          values: Array.from(attribute.array),
        },
      ]),
    ),
  }));
}
function fittingRole(mesh: THREE.Mesh) {
  let object: THREE.Object3D | null = mesh;
  while (object && !object.userData.fitRole && !object.userData.assetId)
    object = object.parent;
  return object?.userData.fitRole;
}
function points(mesh: THREE.Mesh, centers = false) {
  const p = mesh.geometry.getAttribute("position"),
    ix = mesh.geometry.index;
  const vertices = Array.from({ length: p.count }, (_, i) =>
    new THREE.Vector3()
      .fromBufferAttribute(p, i)
      .applyMatrix4(mesh.matrixWorld),
  );
  if (!centers) return vertices;
  const samples = [...vertices];
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const a = vertices[ix?.getX(i) ?? i],
      b = vertices[ix?.getX(i + 1) ?? i + 1],
      c = vertices[ix?.getX(i + 2) ?? i + 2];
    samples.push(
      a
        .clone()
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3),
      a.clone().add(b).multiplyScalar(0.5),
      b.clone().add(c).multiplyScalar(0.5),
      c.clone().add(a).multiplyScalar(0.5),
    );
  }
  return samples;
}
function frontDepth(targets: THREE.Mesh[], p: THREE.Vector3) {
  return new THREE.Raycaster(
    new THREE.Vector3(p.x, p.y, 2),
    new THREE.Vector3(0, 0, -1),
  ).intersectObjects(targets, false)[0]?.point.z;
}
function intersections(source: THREE.Mesh[], target: THREE.Mesh[]) {
  let hits = 0;
  for (const mesh of source) {
    const vertices = points(mesh),
      ix = mesh.geometry.index;
    for (let i = 0; i < (ix?.count ?? vertices.length); i += 3)
      for (let j = 0; j < 3; j++) {
        const a = vertices[ix?.getX(i + j) ?? i + j],
          b = vertices[ix?.getX(i + ((j + 1) % 3)) ?? i + ((j + 1) % 3)];
        const direction = b.clone().sub(a),
          length = direction.length();
        if (length < 0.0002) continue;
        const found = new THREE.Raycaster(
          a,
          direction.normalize(),
          0.0001,
          length - 0.0001,
        ).intersectObjects(target, false);
        if (found.length) hits++;
      }
  }
  return hits;
}
test("mustache follows both heads and every expression; glasses clear actual head triangles", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  try {
    for (const head of partIds("head"))
      for (const face of catalog.assets
        .filter((a) => a.slot === "face")
        .map((a) => a.id))
        for (const eyewear of partIds("eyewear")) {
          const recipe = defaultRecipe(catalog);
          Object.assign(recipe.parts, {
            head,
            face,
            facialHair: "facial-mustache",
            eyewear,
          });
          const avatar = library.create();
          try {
            await avatar.setAppearance(recipe);
            avatar.object.updateMatrixWorld(true);
            const skin = meshes(avatar.object, head);
            for (const mesh of meshes(avatar.object, "facial-mustache"))
              for (const p of points(mesh, true)) {
                const depth = frontDepth(skin, p);
                assert.notEqual(depth, undefined);
                const gap = p.z - depth!;
                assert.ok(
                  gap >= 0.001 && gap < 0.008,
                  `${head}/${face} mustache gap ${gap}`,
                );
              }
            let probes = 0;
            const glasses = meshes(avatar.object, eyewear);
            for (const mesh of glasses.filter(
              (mesh) => fittingRole(mesh) === "front",
            ))
              for (const p of points(mesh, true)) {
                const depth = frontDepth(skin, p);
                if (depth === undefined) continue;
                probes++;
                assert.ok(
                  p.z - depth > 0.008 && p.z - depth < 0.085,
                  `${head}/${eyewear} frame must clear skin without floating in front: ${p.z - depth}`,
                );
                if (Math.abs(p.x) < 0.02)
                  assert.ok(
                    p.z - depth < 0.035,
                    `${head}/${eyewear} bridge floats ${p.z - depth} m from the nose`,
                  );
              }
            assert.ok(probes > 100);
            assert.equal(
              intersections(glasses, skin) + intersections(skin, glasses),
              0,
              `${head}/${eyewear} glasses sides intersect the head or ears`,
            );
          } finally {
            avatar.dispose();
          }
        }
  } finally {
    library.dispose();
  }
});
test("caps contain hair while glasses preserve it, including removal and independent instances", async () => {
  const requests: string[] = [];
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async (i, init) => {
      requests.push(String(i));
      return fetcher(i, init);
    },
  );
  try {
    for (const hair of catalog.assets
      .filter((a) => a.slot === "hair")
      .map((a) => a.id))
      for (const head of partIds("head"))
        for (const { headwear, eyewear } of accessoryStates()) {
          const recipe = defaultRecipe(catalog);
          Object.assign(recipe.parts, { head, hair });
          const create = await library.prepare(recipe),
            untouched = create(),
            avatar = create();
          try {
            const snapshot = () =>
              geometrySnapshot(meshes(avatar.object, hair));
            const original = snapshot();
            await avatar.setAppearance({
              ...recipe,
              parts: {
                ...recipe.parts,
                headwear,
                eyewear,
                facialHair: "facial-mustache",
              },
            });
            avatar.object.updateMatrixWorld(true);
            if (headwear === null) assert.deepEqual(snapshot(), original);
            else assert.notDeepEqual(snapshot(), original);
            assert.deepEqual(
              geometrySnapshot(meshes(untouched.object, hair)),
              original,
            );
            const hairMeshes = meshes(avatar.object, hair),
              cap = headwear ? meshes(avatar.object, headwear) : [];
            assert.equal(
              intersections(hairMeshes, cap) + intersections(cap, hairMeshes),
              0,
              `${head}/${hair}/${headwear}/${eyewear}: hair intersects cap`,
            );
            if (headwear !== null && eyewear !== null) {
              const withGlasses = snapshot();
              await avatar.setAppearance({
                ...recipe,
                parts: { ...recipe.parts, headwear },
              });
              assert.deepEqual(
                snapshot(),
                withGlasses,
                `${head}/${hair}/${headwear}/${eyewear}: eyewear must preserve every hat-fitted hair attribute`,
              );
            }
            assert.equal(avatar.recipe?.parts.hair, hair);
            await avatar.setAppearance(recipe);
            assert.deepEqual(snapshot(), original);
          } finally {
            avatar.dispose();
            untouched.dispose();
          }
        }
    assert.equal(
      requests.filter((p) => /hair-.*\.glb$/.test(p)).length,
      catalog.assets.filter((a) => a.slot === "hair").length,
      "one download per original hairstyle, independent of cap state",
    );
  } finally {
    library.dispose();
  }
});
test("cap containment and glasses occlusion accept unseen wide and tall hair", async () => {
  for (const shape of ["wide", "tall"] as const)
    for (const head of partIds("head"))
      for (const { headwear, eyewear } of accessoryStates()) {
        const { asset, bytes } = await syntheticHair(shape, catalog.rig.id),
          c = structuredClone(catalog);
        c.assets.push(asset);
        const library = new AvatarLibrary(
          c,
          "https://assets.test/",
          async (i, init) =>
            String(i).includes("hair-probe")
              ? new Response(bytes)
              : fetcher(i, init),
        );
        const avatar = library.create();
        try {
          const recipe = defaultRecipe(c);
          Object.assign(recipe.parts, {
            hair: asset.id,
            head,
            headwear,
            eyewear,
          });
          await avatar.setAppearance(recipe);
          avatar.object.updateMatrixWorld(true);
          const hair = meshes(avatar.object, asset.id),
            cap = headwear ? meshes(avatar.object, headwear) : [];
          assert.equal(
            intersections(hair, cap) + intersections(cap, hair),
            0,
            `${shape}/${head}/${headwear}/${eyewear}: cap intersection`,
          );
          const withGlasses = geometrySnapshot(hair);
          await avatar.setAppearance({
            ...recipe,
            parts: { ...recipe.parts, eyewear: null },
          });
          assert.deepEqual(
            geometrySnapshot(meshes(avatar.object, asset.id)),
            withGlasses,
            `${shape}/${head}/${headwear}/${eyewear}: glasses must not change unfamiliar hair attributes`,
          );
          assert.equal(avatar.recipe?.parts.hair, asset.id);
        } finally {
          avatar.dispose();
          library.dispose();
        }
      }
});
test("incompatible surface contracts and invalid deformation volumes fail explicitly", () => {
  const c = structuredClone(catalog),
    r = defaultRecipe(c);
  r.parts.facialHair = "facial-mustache";
  c.assets.find((a) => a.id === r.parts.head)!.surface!.id = "different-face";
  assert.throws(() => validateRecipe(r, c), /compatible fitting surface/);
  for (const change of [
    (v: any) => (v.radii[0] = 0),
    (v: any) => (v.center[1] = NaN),
    (v: any) => (v.transition = [0.3, 0.1]),
    (v: any) => (v.targetSlot = "absent"),
  ]) {
    const bad = structuredClone(catalog);
    change(
      bad.assets.find((a) => a.hairFit?.some((v) => v.mode === "contain"))!
        .hairFit![0],
    );
    assert.throws(() => validateCatalog(bad), /deformation volume/);
  }
});

test("every head/hair/hat/glasses state stays in budget with the heaviest remaining equipment", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  try {
    const recipe = defaultRecipe(catalog);
    for (const slot of catalog.slots)
      recipe.parts[slot.id] = catalog.assets
        .filter((a) => a.slot === slot.id)
        .sort((a, b) => b.triangles - a.triangles)[0]!.id;
    let worst = 0;
    for (const head of partIds("head"))
      for (const hair of [
        null,
        ...catalog.assets.filter((a) => a.slot === "hair").map((a) => a.id),
      ])
        for (const hat of [null, ...partIds("headwear")])
          for (const glasses of [null, ...partIds("eyewear")]) {
            Object.assign(recipe.parts, {
              head,
              hair,
              headwear: hat,
              eyewear: glasses,
            });
            const avatar = library.create();
            try {
              await avatar.setAppearance(recipe);
              const n = avatar.diagnostics().triangles;
              worst = Math.max(worst, n);
              assert.ok(n <= catalog.budgets.maxTriangles);
            } catch (e) {
              throw new Error(
                `${head}/${hair}/${hat}/${glasses}: ${String(e)}`,
              );
            } finally {
              avatar.dispose();
            }
          }
    console.info(`Maximum assembled triangles including fitting: ${worst}`);
  } finally {
    library.dispose();
  }
});

test("a surface fitting failure retains the previous complete appearance", async () => {
  const c = structuredClone(catalog);
  c.assets.find((a) => a.id === "facial-mustache")!.fit!.maxDistance = 0.001;
  const library = new AvatarLibrary(c, "https://assets.test/", fetcher),
    avatar = library.create();
  try {
    const recipe = defaultRecipe(c);
    await avatar.setAppearance(recipe);
    const previous = avatar.object.children[0];
    await assert.rejects(
      avatar.setAppearance({
        ...recipe,
        parts: {
          ...recipe.parts,
          head: "head-spark",
          facialHair: "facial-mustache",
        },
      }),
      /fitting distance/,
    );
    assert.equal(avatar.object.children[0], previous);
    assert.deepEqual(avatar.recipe, recipe);
  } finally {
    avatar.dispose();
    library.dispose();
  }
});

test("collection scalps cover the crown on both heads from overhead", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  try {
    for (const head of partIds("head"))
      for (const hair of ["hair-ember", "hair-tide", "hair-volt"]) {
        const avatar = library.create();
        try {
          const recipe = defaultRecipe(catalog);
          Object.assign(recipe.parts, { head, hair });
          await avatar.setAppearance(recipe);
          avatar.object.updateMatrixWorld(true);
          const skin = meshes(avatar.object, head),
            cap = meshes(avatar.object, hair);
          let checked = 0;
          for (let x = -0.15; x <= 0.15; x += 0.015)
            for (let z = -0.17; z <= 0.13; z += 0.015) {
              const ray = new THREE.Raycaster(
                new THREE.Vector3(x, 3, z),
                new THREE.Vector3(0, -1, 0),
              );
              const headHit = ray.intersectObjects(skin, false)[0];
              if (!headHit || headHit.point.y < 1.95) continue;
              const hairHit = ray.intersectObjects(cap, false)[0];
              checked++;
              assert.ok(
                hairHit && hairHit.distance < headHit.distance - 0.001,
                `${head}/${hair} crown exposed at ${x.toFixed(3)},${z.toFixed(3)} (skin ${headHit.point.y}, hair ${hairHit?.point.y})`,
              );
            }
          assert.ok(checked > 100);
        } finally {
          avatar.dispose();
        }
      }
  } finally {
    library.dispose();
  }
});
