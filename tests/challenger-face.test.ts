import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  inspectGlb,
  validateCatalog,
  type Catalog,
  type Asset,
} from "../src";
import { applyExpressionProjection } from "../src/expression";
import "./helpers/node-image";

const descriptor: Asset = JSON.parse(
  await readFile(
    new URL("../public/capsule/parts/face-challenger.json", import.meta.url),
    "utf8",
  ),
);
const original: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const catalog: Catalog = {
  ...structuredClone(original),
  assets: [...original.assets, descriptor],
};
const fetcher: typeof fetch = async (input) => {
  const pathname = new URL(String(input)).pathname;
  return new Response(
    await readFile(
      new URL(
        "../public" +
          (pathname.endsWith("/face-challenger.glb") ? "/capsule" : "") +
          pathname,
        import.meta.url,
      ),
    ),
  );
};
function owner(object: THREE.Object3D) {
  let node: THREE.Object3D | null = object;
  while (node && !node.userData.assetId) node = node.parent;
  return node?.userData.assetId;
}

test("Challenger is one pinned alpha-texture face with separate front/profile art and unchanged geometry budget", async () => {
  validateCatalog(catalog);
  assert.equal(
    original.assets.some((a) => a.id === descriptor.id),
    false,
  );
  assert.equal(descriptor.slot, "face");
  assert.deepEqual(descriptor.channels, []);
  assert.ok(descriptor.triangles <= 788);
  assert.equal(descriptor.fit?.projection, "radial");
  assert.equal(descriptor.fit?.offset, 0.0015);
  const bytes = await readFile(
    new URL("../public/capsule/" + descriptor.url, import.meta.url),
  );
  assert.equal(bytes.length, descriptor.bytes);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    descriptor.sha256,
  );
  inspectGlb(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    descriptor,
  );
  const json = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  assert.equal(json.images.length, 1);
  assert.equal(json.textures.length, 1);
  assert.equal(json.images[0].mimeType, "image/png");
  assert.equal(json.images[0].uri, undefined);
  assert.deepEqual(
    json.materials.map((m: any) => m.extras.expressionProjection).sort(),
    ["front", "profile"],
  );
  const png = await readFile(
    new URL("../assets/textures/face-challenger.png", import.meta.url),
  );
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 6, "RGBA PNG preserves transparent skin gutters");
});

test("Challenger fits both loaded head GLBs at all body builds and remains socket-bound in motion", async () => {
  const lib = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  try {
    for (const head of catalog.assets.filter((a) => a.slot === "head"))
      for (const weight of [-1, 0, 1]) {
        const avatar = lib.create(),
          recipe = defaultRecipe(catalog);
        recipe.parts.head = head.id;
        recipe.parts.face = descriptor.id;
        recipe.body = { weight };
        try {
          await avatar.setAppearance(recipe);
          const face: THREE.Mesh[] = [];
          avatar.object.traverse((o) => {
            if (o instanceof THREE.Mesh && owner(o) === descriptor.id)
              face.push(o);
          });
          assert.equal(face.length, 2);
          const originals = face.map((m) =>
            Array.from(m.geometry.getAttribute("position").array),
          );
          const materials = face.flatMap((m) =>
            Array.isArray(m.material) ? m.material : [m.material],
          );
          assert.deepEqual(
            materials.map((m) => m.userData.expressionProjection).sort(),
            ["front", "profile"],
          );
          for (const gesture of ["idle", "wave", "run"] as const) {
            avatar.update(1.125, { gesture });
            avatar.object.updateMatrixWorld(true);
            for (const [i, mesh] of face.entries()) {
              assert.deepEqual(
                Array.from(mesh.geometry.getAttribute("position").array),
                originals[i],
              );
              const bounds = new THREE.Box3().setFromObject(mesh);
              assert.ok(
                [...bounds.min.toArray(), ...bounds.max.toArray()].every(
                  Number.isFinite,
                ),
              );
              assert.ok(bounds.getSize(new THREE.Vector3()).length() < 0.7);
            }
          }
          assert.ok(
            avatar.diagnostics().triangles <= catalog.budgets.maxTriangles,
          );
        } finally {
          avatar.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});

test("Challenger retains distinct left/right profile UV cells after actual-head fitting", async () => {
  const lib = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    avatar = lib.create();
  try {
    const recipe = defaultRecipe(catalog);
    recipe.parts.face = descriptor.id;
    await avatar.setAppearance(recipe);
    const ranges: number[][] = [[], []];
    avatar.object.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || owner(o) !== descriptor.id) return;
      const material = Array.isArray(o.material) ? o.material[0] : o.material;
      if (material.userData.expressionProjection !== "profile") return;
      const positions = o.geometry.getAttribute("position"),
        uv = o.geometry.getAttribute("uv");
      for (let i = 0; i < positions.count; i++)
        if (Math.abs(positions.getX(i)) > 0.00001)
          ranges[positions.getX(i) < 0 ? 0 : 1].push(uv.getX(i));
    });
    assert.ok(ranges.every((r) => r.length > 70));
    assert.ok(Math.min(...ranges[0]) >= 0.75 && Math.max(...ranges[0]) < 1);
    assert.ok(Math.min(...ranges[1]) >= 0.5 && Math.max(...ranges[1]) < 0.75);
  } finally {
    avatar.dispose();
    lib.dispose();
  }
});

test("front/profile angle treatment remains the bounded runtime shader contract", () => {
  for (const layer of ["front", "profile"]) {
    const material = new THREE.MeshStandardMaterial();
    material.userData.expressionProjection = layer;
    applyExpressionProjection(material);
    const shader = {
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <alphatest_fragment>",
      uniforms: {},
    };
    material.onBeforeCompile(
      shader as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    assert.match(
      shader.vertexShader,
      /smoothstep\(0.20, 0.45, abs\(expressionView.z\)\)/,
    );
    assert.ok(
      shader.fragmentShader.includes(
        layer === "profile"
          ? "*= vExpressionProfile"
          : "*= (1.0 - vExpressionProfile)",
      ),
    );
    assert.match(shader.fragmentShader, /if \(diffuseColor.a < 0.01\) discard/);
    material.dispose();
  }
});

test("Challenger substitutes for the heaviest legacy face without increasing any source-triangle stack", () => {
  const oldFaces = original.assets.filter((a) => a.slot === "face");
  assert.ok(oldFaces.every((face) => descriptor.triangles <= face.triangles));
  assert.ok(oldFaces.every((face) => descriptor.bytes <= face.bytes));
});
