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
    for (const head of ["head-scout", "head-spark"])
      for (const face of ["face-focus", "face-grin", "face-wink"]) {
        const recipe = defaultRecipe(catalog);
        Object.assign(recipe.parts, {
          head,
          face,
          facialHair: "facial-mustache",
          eyewear: "acc-glasses",
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
          for (const mesh of meshes(avatar.object, "acc-glasses"))
            for (const p of points(mesh, true)) {
              const depth = frontDepth(skin, p);
              if (depth === undefined) continue;
              probes++;
              assert.ok(
                p.z - depth > 0.008,
                `${head} frame penetrates face: ${p.z - depth}`,
              );
            }
          assert.ok(probes > 100);
        } finally {
          avatar.dispose();
        }
      }
  } finally {
    library.dispose();
  }
});
test("one hair asset fits cap and glasses, restores on removal, and isolates other instances", async () => {
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
    for (const hair of ["hair-sweep", "hair-curls", "hair-pony"])
      for (const head of ["head-scout", "head-spark"])
        for (const worn of ["hat", "glasses", "both"]) {
          const recipe = defaultRecipe(catalog);
          Object.assign(recipe.parts, { head, hair });
          const create = await library.prepare(recipe),
            untouched = create(),
            avatar = create();
          try {
            const snapshot = () =>
              meshes(avatar.object, hair).flatMap((m) =>
                Array.from(m.geometry.getAttribute("position").array),
              );
            const original = snapshot();
            await avatar.setAppearance({
              ...recipe,
              parts: {
                ...recipe.parts,
                headwear: worn === "glasses" ? null : "hat-club-cap",
                eyewear: worn === "hat" ? null : "acc-glasses",
                facialHair: "facial-mustache",
              },
            });
            avatar.object.updateMatrixWorld(true);
            assert.notDeepEqual(snapshot(), original);
            assert.deepEqual(
              meshes(untouched.object, hair).flatMap((m) =>
                Array.from(m.geometry.getAttribute("position").array),
              ),
              original,
            );
            const hairMeshes = meshes(avatar.object, hair),
              cap = meshes(avatar.object, "hat-club-cap"),
              glasses = meshes(avatar.object, "acc-glasses");
            assert.equal(
              intersections(hairMeshes, cap) + intersections(cap, hairMeshes),
              0,
              `${head}/${hair}: hair intersects cap`,
            );
            assert.equal(
              intersections(hairMeshes, glasses) +
                intersections(glasses, hairMeshes),
              0,
              `${head}/${hair}: hair intersects glasses`,
            );
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
      3,
      "one download per original hairstyle, independent of cap state",
    );
  } finally {
    library.dispose();
  }
});
test("accessory volumes fit unseen wide and tall hair without per-style metadata", async () => {
  for (const shape of ["wide", "tall"] as const)
    for (const worn of ["hat", "glasses", "both"]) {
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
          headwear: worn === "glasses" ? null : "hat-club-cap",
          eyewear: worn === "hat" ? null : "acc-glasses",
        });
        await avatar.setAppearance(recipe);
        avatar.object.updateMatrixWorld(true);
        const hair = meshes(avatar.object, asset.id),
          cap = meshes(avatar.object, "hat-club-cap"),
          glasses = meshes(avatar.object, "acc-glasses");
        assert.equal(
          intersections(hair, cap) + intersections(cap, hair),
          0,
          `${shape}/${worn}: cap intersection`,
        );
        assert.equal(
          intersections(hair, glasses) + intersections(glasses, hair),
          0,
          `${shape}/${worn}: glasses intersection`,
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
    for (const head of ["head-scout", "head-spark"])
      for (const hair of [null, "hair-sweep", "hair-curls", "hair-pony"])
        for (const hat of [null, "hat-club-cap"])
          for (const glasses of [null, "acc-glasses"]) {
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
