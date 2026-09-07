import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import {
  defaultRecipe,
  parseRecipe,
  validateCatalog,
  recipeKey,
  type Catalog,
} from "../src/core";
import "./helpers/node-image";

const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
function library() {
  return new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async (input) =>
      new Response(
        await readFile(
          new URL(
            "../public" + new URL(String(input)).pathname,
            import.meta.url,
          ),
        ),
      ),
  );
}
function vertices(avatar: ReturnType<AvatarLibrary["create"]>) {
  avatar.object.updateMatrixWorld(true);
  const points = new Map<string, THREE.Vector3[]>();
  avatar.object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    points.set(
      o.uuid,
      Array.from(
        { length: o.geometry.getAttribute("position").count },
        (_, i) =>
          o
            .getVertexPosition(i, new THREE.Vector3())
            .applyMatrix4(o.matrixWorld),
      ),
    );
  });
  return [...points.values()].flat();
}
test("weight changes the real meshes and skeleton together, preserves height, and restores the exact source", async () => {
  const lib = library(),
    a = lib.create(),
    b = lib.create();
  try {
    const recipe = defaultRecipe(catalog);
    recipe.parts.hair = "hair-sweep";
    await a.setAppearance(recipe);
    await b.setAppearance(recipe);
    const rest = vertices(a),
      other = vertices(b);
    for (const weight of [-1, -0.5, 0.5, 1]) {
      const next = { ...recipe, body: { weight } };
      assert.equal(
        parseRecipe(JSON.stringify(next), catalog).body!.weight,
        weight,
      );
      await a.setAppearance(next);
      const shaped = vertices(a);
      assert.equal(shaped.length, rest.length);
      const extent = (points: THREE.Vector3[]) => [
        Math.min(...points.map((p) => p.y)),
        Math.max(...points.map((p) => p.y)),
      ];
      assert.deepEqual(
        extent(shaped),
        extent(rest),
        "weight must preserve floor and total height",
      );
      a.object.traverse((o) => {
        if (o instanceof THREE.Bone) {
          const original: THREE.Bone[] = [];
          b.object.traverse((p) => {
            if (p instanceof THREE.Bone && p.name === o.name) original.push(p);
          });
          assert.ok(original.length > 0);
          assert.ok(
            o
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(original[0].getWorldPosition(new THREE.Vector3())) <
              1e-6,
            `${o.name} center must not move with weight`,
          );
        }
      });
      let moved = 0;
      for (let i = 0; i < rest.length; i++) {
        assert.ok(shaped[i].toArray().every(Number.isFinite));
        if (shaped[i].distanceTo(rest[i]) > 0.003) moved++;
      }
      assert.ok(
        moved > 100,
        "weight must change actual body/clothing geometry",
      );
      const waist = shaped.filter(
        (p) => p.y > 1.09 && p.y < 1.18 && Math.abs(p.x) < 0.3,
      );
      const original = rest.filter(
        (p) => p.y > 1.09 && p.y < 1.18 && Math.abs(p.x) < 0.3,
      );
      const depth = (v: THREE.Vector3[]) =>
        Math.max(...v.map((p) => p.z)) - Math.min(...v.map((p) => p.z));
      assert.ok(
        weight > 0
          ? depth(waist) > depth(original)
          : depth(waist) < depth(original),
      );
      for (const gesture of ["wave", "walk", "run"] as const) {
        for (const time of [0, 0.1, 0.2, 0.3]) a.update(time, { gesture });
        assert.ok(
          vertices(a).every(
            (p) => p.toArray().every(Number.isFinite) && p.length() < 3,
          ),
        );
      }
    }
    assert.deepEqual(
      vertices(b).map((p) => p.toArray()),
      other.map((p) => p.toArray()),
      "another instance must remain unchanged",
    );
    await a.setAppearance(recipe);
    assert.deepEqual(
      vertices(a).map((p) => p.toArray()),
      rest.map((p) => p.toArray()),
      "zero weight must restore the same source mesh",
    );
    assert.notEqual(
      recipeKey(recipe),
      recipeKey({ ...recipe, body: { weight: 1 } }),
    );
  } finally {
    a.dispose();
    b.dispose();
    lib.dispose();
  }
});

test("shape and coverage contracts reject unsupported, non-finite and unbounded values", () => {
  const recipe = defaultRecipe(catalog);
  for (const weight of [-1.01, 1.01, null, "large", Infinity])
    assert.throws(() =>
      parseRecipe(JSON.stringify({ ...recipe, body: { weight } }), catalog),
    );
  assert.throws(() =>
    parseRecipe(
      JSON.stringify({ ...recipe, body: { weight: 0, height: 2 } }),
      catalog,
    ),
  );
  const c = structuredClone(catalog);
  delete c.bodyShape;
  assert.throws(() =>
    parseRecipe(JSON.stringify({ ...recipe, body: { weight: 0 } }), c),
  );
  for (const alter of [
    (c: Catalog) => (c.bodyShape!.weightProfile[2][0] = -1),
    (c: Catalog) => (c.bodyShape!.weightProfile[2][1] = 1),
    (c: Catalog) =>
      (c.assets.find((a) => a.slot === "shirt")!.covers = ["unknown-region"]),
    (c: Catalog) => (c.bodyShape!.limbs[0].joints = ["head", "foot_L"]),
    (c: Catalog) => (c.bodyShape!.limbs[0].radius = 0),
    (c: Catalog) => (c.bodyShape!.leanFactor = NaN),
    (c: Catalog) => (c.bodyShape!.limbs[0].profile[1][0] = 0),
  ]) {
    const c = structuredClone(catalog);
    alter(c);
    assert.throws(() => validateCatalog(c));
  }
});

test("arm and leg cross-sections gain tissue around their own axes without bowing the centerline", async () => {
  const { applyBodyShape } = await import("../src/body-shape");
  for (const weight of [-1, 1]) {
    const root = new THREE.Group(),
      sockets = new Map<string, THREE.Bone>();
    for (const socket of catalog.rig.sockets) {
      const bone = new THREE.Bone();
      bone.name = socket.id;
      bone.position.fromArray(socket.position);
      (socket.parent ? sockets.get(socket.parent)! : root).add(bone);
      sockets.set(socket.id, bone);
    }
    root.updateMatrixWorld(true);
    const original: THREE.Vector3[] = [];
    for (const limb of catalog.bodyShape!.limbs) {
      const a = sockets
        .get(limb.joints[0])!
        .getWorldPosition(new THREE.Vector3());
      const b = sockets
        .get(limb.joints[1])!
        .getWorldPosition(new THREE.Vector3());
      const axis = b.clone().sub(a).normalize(),
        center = a.clone().lerp(b, 0.7);
      const radial = axis
        .clone()
        .cross(new THREE.Vector3(0, 0, 1))
        .normalize()
        .multiplyScalar(0.03);
      original.push(
        center.clone(),
        center.clone().add(radial),
        center.clone().sub(radial),
      );
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(original),
      material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    root.add(mesh);
    applyBodyShape(root, sockets, catalog.bodyShape!, weight);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < original.length; i += 3) {
      const center = new THREE.Vector3().fromBufferAttribute(positions, i);
      const left = new THREE.Vector3().fromBufferAttribute(positions, i + 1),
        right = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
      assert.ok(
        center.distanceTo(original[i]) < 1e-6,
        "the limb axis itself is fixed",
      );
      assert.ok(
        left.clone().add(right).multiplyScalar(0.5).distanceTo(center) < 1e-6,
        "opposite sides expand symmetrically around the limb",
      );
      const ratio =
        left.distanceTo(right) / original[i + 1].distanceTo(original[i + 2]);
      assert.ok(
        weight > 0 ? ratio > 1.15 && ratio < 1.5 : ratio < 0.95 && ratio > 0.7,
        `anatomical radial volume ratio ${ratio}`,
      );
    }
    geometry.dispose();
    material.dispose();
  }
});
