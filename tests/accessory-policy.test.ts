import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { validateCatalog, type Catalog, type Asset } from "../src";
import { fitAssembly } from "../src/fitting";

const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);

test("natural occlusion cannot accidentally request hair deformation", () => {
  const glasses = catalog.assets.find((asset) => asset.id === "acc-glasses")!;
  assert.deepEqual(glasses.hairFit, [{ targetSlot: "hair", mode: "occlude" }]);
  assert.equal(glasses.fit?.mode, "clearance", "skin clearance is independent");
  assert.equal(glasses.fit?.projection, "wrap");
  for (const interactions of [
    [{ targetSlot: "hair", mode: "occlude", radii: [0.1, 0.1, 0.1] }],
    [{ targetSlot: "hair", mode: "occlude", centre: [0, 0, 0] }],
    [{ targetSlot: "hair", mode: "occlude", transition: [0, 0.1] }],
    [{ targetSlot: "missing", mode: "occlude" }],
    [{ targetSlot: "eyewear", mode: "occlude" }],
    [{ targetSlot: "hair", mode: "occlusion" }],
    [
      { targetSlot: "hair", mode: "occlude" },
      { targetSlot: "hair", mode: "occlude" },
    ],
    [
      { targetSlot: "hair", mode: "occlude" },
      {
        targetSlot: "hair",
        mode: "clearance",
        center: [0, 0, 0],
        radii: [0.1, 0.1, 0.1],
      },
    ],
  ]) {
    const invalid = structuredClone(catalog);
    invalid.assets.find((asset) => asset.id === glasses.id)!.hairFit =
      interactions as Asset["hairFit"];
    assert.throws(() => validateCatalog(invalid), /deformation volume/);
  }
});

test("occluding accessories preserve every hair attribute, triangle and shared mesh", () => {
  const source = new THREE.BoxGeometry(0.4, 0.3, 0.4),
    root = new THREE.Group(),
    socket = new THREE.Bone(),
    target = new THREE.Group(),
    material = new THREE.MeshBasicMaterial(),
    a = new THREE.Mesh(source, material),
    b = new THREE.Mesh(source, material);
  const hair = catalog.assets.find((asset) => asset.slot === "hair")!;
  const glasses = {
    ...catalog.assets.find((asset) => asset.id === "acc-glasses")!,
    fit: undefined,
    hairFit: [{ targetSlot: "hair", mode: "occlude" as const }],
  };
  target.userData.assetId = hair.id;
  target.add(a, b);
  b.position.x = 0.01;
  socket.add(target);
  root.add(socket);
  const attributes = Object.fromEntries(
    Object.entries(source.attributes).map(([name, attribute]) => [
      name,
      Array.from(attribute.array),
    ]),
  );
  const indices = Array.from(source.index!.array),
    groups = structuredClone(source.groups);
  let disposals = 0;
  source.addEventListener("dispose", () => disposals++);
  try {
    fitAssembly(root, [hair, glasses], socket, catalog.budgets.maxTriangles);
    assert.equal(a.geometry, source);
    assert.equal(
      b.geometry,
      source,
      "occlusion must not allocate fitted geometry",
    );
    assert.equal(disposals, 0);
    for (const [name, values] of Object.entries(attributes))
      assert.deepEqual(Array.from(source.getAttribute(name).array), values);
    assert.deepEqual(Array.from(source.index!.array), indices);
    assert.deepEqual(source.groups, groups);
  } finally {
    source.dispose();
    material.dispose();
  }
});

function wrapFixture() {
  const root = new THREE.Group(),
    socket = new THREE.Bone(),
    material = new THREE.MeshBasicMaterial(),
    headGroup = new THREE.Group(),
    frames = new THREE.Group(),
    sides = new THREE.Group();
  const head = catalog.assets.find((asset) => asset.id === "head-scout")!,
    glasses = catalog.assets.find((asset) => asset.id === "acc-glasses")!;
  headGroup.userData.assetId = head.id;
  frames.userData.assetId = glasses.id;
  frames.userData.fitRole = "front";
  sides.userData.fitRole = "side";
  const skin = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), material),
    front = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.012), material);
  front.position.z = 0.18;
  frames.add(front, sides);
  for (const sign of [-1, 1]) {
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.025, 0.35),
      material,
    );
    side.position.set(sign * 0.13, 0.01, 0.02);
    sides.add(side);
  }
  headGroup.add(skin);
  socket.add(headGroup, frames);
  root.add(socket);
  return {
    root,
    socket,
    head,
    glasses,
    skin,
    front,
    frames,
    sides,
    dispose() {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      material.dispose();
    },
  };
}

test("wrap fitting resolves the interior of long side faces without moving the front away", () => {
  const fixture = wrapFixture();
  try {
    const before = fixture.sides.children.reduce(
      (sum, object) => sum + (object as THREE.Mesh).geometry.index!.count / 3,
      0,
    );
    fitAssembly(
      fixture.root,
      [fixture.head, fixture.glasses],
      fixture.socket,
      14000,
    );
    fixture.root.updateMatrixWorld(true);
    let triangles = 0,
      checks = 0;
    for (const object of fixture.sides.children) {
      const mesh = object as THREE.Mesh,
        position = mesh.geometry.getAttribute("position"),
        index = mesh.geometry.index;
      assert.deepEqual(
        Object.keys(mesh.geometry.attributes).sort(),
        ["normal", "position", "uv"],
        "source provenance must remain private to fitting",
      );
      triangles += (index?.count ?? position.count) / 3;
      for (let i = 0; i < (index?.count ?? position.count); i += 3) {
        const vertices = [0, 1, 2].map((j) =>
          new THREE.Vector3()
            .fromBufferAttribute(position, index?.getX(i + j) ?? i + j)
            .applyMatrix4(mesh.matrixWorld),
        );
        for (const p of [
          ...vertices,
          ...[0, 1, 2].map((j) =>
            vertices[j]
              .clone()
              .add(vertices[(j + 1) % 3])
              .multiplyScalar(0.5),
          ),
          vertices[0]
            .clone()
            .add(vertices[1])
            .add(vertices[2])
            .multiplyScalar(1 / 3),
        ]) {
          const sign = p.x < 0 ? -1 : 1;
          const hit = new THREE.Raycaster(
            new THREE.Vector3(sign, p.y, p.z),
            new THREE.Vector3(-sign, 0, 0),
          ).intersectObject(fixture.skin, false)[0];
          if (!hit) continue;
          checks++;
          assert.ok(
            sign * (p.x - hit.point.x) >= 0.0029,
            `side face crosses skin at ${p.toArray()}`,
          );
        }
      }
    }
    assert.ok(
      triangles > before,
      "long side faces require extra contact samples",
    );
    assert.ok(checks > 100);
    const bridge = new THREE.Box3()
      .setFromObject(fixture.front)
      .getCenter(new THREE.Vector3());
    assert.ok(
      bridge.z > 0.15 && bridge.z < 0.19,
      `front floats at ${bridge.z}`,
    );
  } finally {
    fixture.dispose();
  }
});

test("wrap contracts reject absent or unknown semantic roles and unsafe offsets", () => {
  for (const role of [undefined, "rear-ish", "surface"] as const) {
    const fixture = wrapFixture();
    fixture.sides.userData.fitRole = role;
    // A role is inherited through GLTF primitive groups, so remove the front
    // ancestor role to ensure an unlabelled side cannot silently inherit it.
    delete fixture.frames.userData.fitRole;
    fixture.front.userData.fitRole = "front";
    try {
      assert.throws(
        () =>
          fitAssembly(
            fixture.root,
            [fixture.head, fixture.glasses],
            fixture.socket,
            14000,
          ),
        /explicit front and side/,
      );
    } finally {
      fixture.dispose();
    }
  }
  for (const value of [undefined, 0, NaN, 0.04]) {
    const invalid = structuredClone(catalog);
    invalid.assets.find(
      (asset) => asset.id === "acc-glasses",
    )!.fit!.sideOffset = value;
    assert.throws(() => validateCatalog(invalid), /surface fitting contract/);
  }
});

test("side refinement limits total displacement from the interpolated source", () => {
  const fixture = wrapFixture();
  const glasses = structuredClone(fixture.glasses);
  glasses.fit!.maxDistance = 0.03;
  try {
    // Every isolated lateral correction is below 30 mm. Its combination with
    // the prior front translation exceeds that bound near the temple apex.
    assert.throws(
      () =>
        fitAssembly(
          fixture.root,
          [fixture.head, glasses],
          fixture.socket,
          14000,
        ),
      /cumulative fitting distance/,
    );
  } finally {
    fixture.dispose();
  }
  const permitted = wrapFixture();
  const reachable = structuredClone(permitted.glasses);
  reachable.fit!.maxDistance = 0.031;
  try {
    assert.doesNotThrow(() =>
      fitAssembly(
        permitted.root,
        [permitted.head, reachable],
        permitted.socket,
        14000,
      ),
    );
  } finally {
    permitted.dispose();
  }
});

test("contact projection rejects excessive coordinate spans before unbounded work", () => {
  const fixture = wrapFixture();
  fixture.front.geometry.scale(10000, 1, 1);
  try {
    assert.throws(
      () =>
        fitAssembly(
          fixture.root,
          [fixture.head, fixture.glasses],
          fixture.socket,
          14000,
        ),
      /projection complexity limit/,
    );
  } finally {
    fixture.dispose();
  }
});
