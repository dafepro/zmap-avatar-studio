import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ComicStyle } from "../src/comic";

function fixture(
  assetId = "head-test",
  material = new THREE.MeshStandardMaterial({ color: "#c68b60" }),
) {
  material.name = "skin";
  const parent = new THREE.Group();
  const root = new THREE.Group();
  root.userData.assetId = assetId;
  parent.add(root);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), material);
  root.add(mesh);
  return { parent, root, mesh, material };
}

test("illustrated mode preserves painted maps, alpha and source geometry and restores the palette", () => {
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 80, 40, 180]),
    1,
    1,
  );
  const original = new THREE.MeshStandardMaterial({
    color: "#f4ead7",
    map: texture,
    transparent: true,
    alphaTest: 0.1,
  });
  const { root, mesh } = fixture("face-painted", original);
  const geometry = mesh.geometry;
  const style = new ComicStyle();
  let originalDisposals = 0,
    paintDisposals = 0,
    textureDisposals = 0;
  original.addEventListener("dispose", () => originalDisposals++);
  texture.addEventListener("dispose", () => textureDisposals++);
  style.update(root, new THREE.Vector2(600, 800));
  const paint = mesh.material as unknown as THREE.MeshBasicMaterial;
  paint.addEventListener("dispose", () => paintDisposals++);
  assert.notEqual(paint, original);
  assert.equal(paint.map, texture);
  assert.equal(paint.transparent, true);
  assert.equal(paint.alphaTest, 0.1);
  assert.ok(paint.color.equals(original.color));
  assert.equal(mesh.geometry, geometry);
  assert.equal(
    mesh.children.length,
    0,
    "transparent face paint must not acquire a rectangular ink hull",
  );
  style.clear();
  assert.equal(mesh.material, original);
  assert.equal(paintDisposals, 1);
  assert.equal(originalDisposals, 0);
  assert.equal(textureDisposals, 0);
  style.dispose();
  assert.equal(paintDisposals, 1);
});

test("style replacement releases retired materials and ink without disposing shared maps", () => {
  const first = fixture(),
    second = fixture();
  const style = new ComicStyle();
  let originalDisposals = 0,
    paintDisposals = 0,
    hullDisposals = 0;
  first.material.addEventListener("dispose", () => originalDisposals++);
  style.update(first.root, new THREE.Vector2(100, 100));
  (first.mesh.material as THREE.Material).addEventListener(
    "dispose",
    () => paintDisposals++,
  );
  const outline = first.mesh.children[0] as THREE.Mesh;
  outline.geometry.addEventListener("dispose", () => hullDisposals++);
  const currentPaint = first.mesh.material;
  style.update(first.root, new THREE.Vector2(200, 200));
  assert.equal(
    first.mesh.material,
    currentPaint,
    "a resize updates uniforms without new materials",
  );
  first.parent.remove(first.root);
  style.update(second.root, new THREE.Vector2(200, 200));
  assert.equal(originalDisposals, 1);
  assert.equal(paintDisposals, 1);
  assert.equal(hullDisposals, 1);
  assert.equal(first.mesh.children.length, 0);
  style.dispose();
  assert.equal(second.mesh.material, second.material);
});

test("skinned silhouette uses the same skeleton and retains weights without mutating the source", () => {
  const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 8, 2);
  const count = geometry.getAttribute("position").count;
  const indices = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  const bone = new THREE.Bone();
  const skeleton = new THREE.Skeleton([bone]);
  const mesh = new THREE.SkinnedMesh(
    geometry,
    new THREE.MeshStandardMaterial(),
  );
  mesh.add(bone);
  mesh.bind(skeleton);
  const root = new THREE.Group();
  root.add(mesh);
  const parent = new THREE.Group();
  parent.add(root);
  const style = new ComicStyle();
  style.update(root, new THREE.Vector2(300, 300));
  const outline = mesh.children.find(
    (child) => child.userData.comicOutline,
  ) as THREE.SkinnedMesh;
  assert.ok(outline instanceof THREE.SkinnedMesh);
  assert.equal(outline.skeleton, skeleton);
  assert.ok(outline.bindMatrix.equals(mesh.bindMatrix));
  assert.ok(outline.geometry.getAttribute("skinIndex"));
  assert.ok(outline.geometry.getAttribute("skinWeight"));
  assert.equal(mesh.geometry, geometry);
  assert.notEqual(outline.geometry, geometry);
  style.dispose();
  assert.deepEqual(mesh.children, [bone]);
});

test("zero ink width avoids shell geometry and facial lighting is one continuous head volume", () => {
  const { root, mesh } = fixture();
  const style = new ComicStyle({ inkWidth: 0 });
  style.update(root, new THREE.Vector2(100, 100));
  assert.equal(mesh.children.length, 0);
  const paint = mesh.material as unknown as THREE.MeshBasicMaterial;
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.basic.vertexShader,
    fragmentShader: THREE.ShaderLib.basic.fragmentShader,
  };
  paint.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
  assert.equal((shader.uniforms as any).illustratedFace.value, 1);
  assert.ok(
    !shader.fragmentShader.includes("gl_FragCoord"),
    "surface pigment must not move with screen pixels",
  );
  assert.ok(shader.vertexShader.includes("#include <skinnormal_vertex>"));
  style.dispose();
});
