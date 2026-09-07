import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  bakeDirectionalAtlas,
  directionIndex,
  stableDirectionIndex,
  directionalFrames,
  DirectionalAtlas,
  type DirectionalMetadata,
} from "../src/directional";

test("sixteen directional sectors wrap both ways and retain a stable view near boundaries", () => {
  const step = Math.PI / 8;
  for (let index = 0; index < 16; index++) {
    for (const loops of [-3, -1, 0, 2]) {
      assert.equal(directionIndex(index * step + loops * Math.PI * 2), index);
      assert.equal(
        directionIndex(index * step + loops * Math.PI * 2 + step * 0.49),
        index,
      );
      assert.equal(
        directionIndex(index * step + loops * Math.PI * 2 - step * 0.49),
        index,
      );
    }
  }
  assert.equal(directionIndex(-0.3), 15);
  assert.equal(stableDirectionIndex(step * 0.52, 0), 0);
  assert.equal(stableDirectionIndex(step * 0.62, 0), 1);
  assert.equal(stableDirectionIndex(-step * 0.52, 0), 0);
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(() => directionIndex(value));
  assert.throws(() => stableDirectionIndex(0, 16));
  assert.throws(() => stableDirectionIndex(0, 0, 1));
});

test("atlas frame rectangles and inset UVs agree across PNG and WebGL row order", () => {
  const frames = directionalFrames(256);
  assert.equal(frames.length, 16);
  assert.deepEqual(frames[0].rect, { x: 0, y: 0, width: 256, height: 256 });
  assert.deepEqual(frames[15].rect, {
    x: 768,
    y: 768,
    width: 256,
    height: 256,
  });
  for (const frame of frames) {
    assert.ok(
      frame.uv[0] >= 0 &&
        frame.uv[1] >= 0 &&
        frame.uv[2] <= 1 &&
        frame.uv[3] <= 1,
    );
    assert.equal(frame.uv[0] * 1024, frame.rect.x + 0.5);
    assert.equal(frame.uv[1] * 1024, 1024 - frame.rect.y - 256 + 0.5);
  }
  for (const bad of [0, 63, 513, 128.5, Infinity])
    assert.throws(() => directionalFrames(bad));
});

function metadata(): DirectionalMetadata {
  return {
    version: 1,
    projection: "orthographic-16",
    width: 256,
    height: 256,
    tileSize: 64,
    columns: 4,
    rows: 4,
    elevation: Math.PI / 24,
    center: [0, 1, 0],
    worldSize: 2.2,
    colorSpace: "srgb",
    pixelOrder: "bottom-up-rgba8",
    textureBytes: 256 * 256 * 4,
    frames: directionalFrames(64),
  };
}

test("preview instances share one atlas texture, isolate direction state and release resources once", () => {
  const source = metadata();
  const atlas = new DirectionalAtlas(
    source,
    new Uint8Array(source.textureBytes),
  );
  const a = atlas.createPreview(),
    b = atlas.createPreview();
  let textures = 0,
    geometry = 0,
    materials = 0;
  atlas.texture.addEventListener("dispose", () => textures++);
  a.object.geometry.addEventListener("dispose", () => geometry++);
  a.object.material.addEventListener("dispose", () => materials++);
  assert.equal(
    a.object.material.uniforms.atlas.value,
    b.object.material.uniforms.atlas.value,
  );
  assert.notEqual(a.object.material, b.object.material);
  a.setAzimuth(Math.PI);
  assert.equal(a.frameIndex, 8);
  assert.equal(b.frameIndex, 0);
  assert.equal(atlas.texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(atlas.texture.generateMipmaps, false);
  source.frames[0].rect.x = 100;
  assert.equal(atlas.metadata.frames[0].rect.x, 0);
  const readback = atlas.readPixels();
  readback[0] = 250;
  assert.equal(atlas.readPixels()[0], 0);
  a.dispose();
  a.dispose();
  assert.equal(geometry, 1);
  assert.equal(materials, 1);
  assert.equal(textures, 0);
  atlas.dispose();
  atlas.dispose();
  assert.equal(textures, 1);
  assert.throws(() => b.setFrame(1), /disposed/);
  assert.throws(() => atlas.createPreview(), /disposed/);
  assert.throws(() => atlas.readPixels(), /disposed/);
});

/** State-aware renderer double: GPU pixel appearance is separately checked in the browser integration. */
class CaptureRenderer {
  capabilities = { maxTextureSize: 4096 };
  extensions = { has: (_name: string) => true };
  xr = { enabled: true };
  shadowMap = { autoUpdate: true };
  autoClear = true;
  toneMapping = THREE.ACESFilmicToneMapping;
  toneMappingExposure = 1.1;
  outputColorSpace = THREE.SRGBColorSpace;
  uploadedTextures = new Set<THREE.Texture>();
  viewport = new THREE.Vector4(4, 5, 800, 600);
  scissor = new THREE.Vector4(6, 7, 780, 580);
  scissorTest = true;
  color = new THREE.Color("#c8a055");
  alpha = 0.7;
  target: THREE.WebGLRenderTarget | null = null;
  closed = false;
  rendered = 0;
  targets = new Set<THREE.WebGLRenderTarget>();
  disposedTargets = new Set<THREE.WebGLRenderTarget>();
  onAvatar?: (root: THREE.Object3D, camera: THREE.Camera) => void;
  getRenderTarget() {
    return this.target;
  }
  setRenderTarget(target: THREE.WebGLRenderTarget | null) {
    this.target = target;
    if (target && !this.targets.has(target)) {
      this.targets.add(target);
      target.addEventListener("dispose", () =>
        this.disposedTargets.add(target),
      );
    }
  }
  getActiveCubeFace() {
    return 0;
  }
  getActiveMipmapLevel() {
    return 0;
  }
  getViewport(target: THREE.Vector4) {
    return target.copy(this.viewport);
  }
  setViewport(value: THREE.Vector4) {
    this.viewport.copy(value);
  }
  getScissor(target: THREE.Vector4) {
    return target.copy(this.scissor);
  }
  setScissor(value: THREE.Vector4) {
    this.scissor.copy(value);
  }
  getScissorTest() {
    return this.scissorTest;
  }
  setScissorTest(value: boolean) {
    this.scissorTest = value;
  }
  getClearColor(target: THREE.Color) {
    return target.copy(this.color);
  }
  setClearColor(value: THREE.ColorRepresentation, alpha: number) {
    this.color.set(value);
    this.alpha = alpha;
  }
  getClearAlpha() {
    return this.alpha;
  }
  getContext() {
    return { isContextLost: () => this.closed };
  }
  initTexture(texture: THREE.Texture) {
    this.uploadedTextures.add(texture);
  }
  clear() {}
  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.rendered++;
    const root = scene.getObjectByName("test avatar");
    if (root) this.onAvatar?.(root, camera);
  }
  readRenderTargetPixels(
    _target: THREE.WebGLRenderTarget,
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    pixels: Uint8Array,
  ) {
    pixels[3] = 255;
  }
  asRenderer() {
    return this as unknown as THREE.WebGLRenderer;
  }
}

function avatar() {
  const root = new THREE.Group();
  root.name = "test avatar";
  const texture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 2, 0.3),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  mesh.position.y = 1;
  root.add(mesh);
  return { root, mesh, texture };
}

function assertRestored(renderer: CaptureRenderer) {
  assert.equal(renderer.target, null);
  assert.equal(renderer.scissorTest, true);
  assert.equal(renderer.autoClear, true);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.alpha, 0.7);
  assert.equal(renderer.color.getHexString(), "c8a055");
  assert.deepEqual(renderer.viewport.toArray(), [4, 5, 800, 600]);
  assert.deepEqual(renderer.scissor.toArray(), [6, 7, 780, 580]);
}

test("a capture owns snapshots, returns all directions and restores renderer state between frames", async () => {
  const renderer = new CaptureRenderer();
  const { root, mesh, texture } = avatar();
  root.position.x = 0.7;
  let customCompiles = 0;
  const illustratedShader = () => {
    customCompiles++;
  };
  mesh.material.onBeforeCompile = illustratedShader;
  mesh.material.customProgramCacheKey = () => "illustrated-face";
  let geometriesDisposed = 0,
    mapsDisposed = 0;
  renderer.onAvatar = (copy, camera) => {
    const copied = copy.children[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;
    assert.notEqual(copy, root);
    assert.notEqual(copied.geometry, mesh.geometry);
    assert.notEqual(copied.material, mesh.material);
    const shader = {
      uniforms: {},
      fragmentShader:
        "void main(){\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
    } as any;
    copied.material.onBeforeCompile(shader, renderer.asRenderer());
    assert.ok(shader.fragmentShader.includes("ACESFilmicToneMapping"));
    assert.ok(shader.fragmentShader.includes("sRGBTransferOETF(gl_FragColor)"));
    assert.ok(
      copied.material
        .customProgramCacheKey()
        .startsWith("illustrated-face|directional-screen:"),
    );
    assert.notEqual(copied.material.map, texture);
    assert.ok(renderer.uploadedTextures.has(copied.material.map!));
    assert.equal(copy.position.x, 0.7);
    if (renderer.rendered === 1) {
      copied.geometry.addEventListener("dispose", () => geometriesDisposed++);
      copied.material.map!.addEventListener("dispose", () => mapsDisposed++);
    }
    camera.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(copy, true);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          assert.ok(
            Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1,
            "all posed bounds remain within every capture",
          );
        }
  };
  const progress: number[] = [];
  const atlas = await bakeDirectionalAtlas(renderer.asRenderer(), root, {
    tileSize: 64,
    onProgress: (done) => progress.push(done),
    yieldBetweenFrames: async () => assertRestored(renderer),
  });
  assert.deepEqual(
    progress,
    Array.from({ length: 16 }, (_, i) => i + 1),
  );
  assert.equal(renderer.rendered, 32);
  assert.equal(customCompiles, 16);
  assert.equal(geometriesDisposed, 1);
  assert.equal(mapsDisposed, 1);
  assert.equal(renderer.disposedTargets.size, 2);
  assert.equal(atlas.readPixels()[3], 255);
  assert.equal(root.position.x, 0.7);
  assert.equal(mesh.geometry.attributes.position.count, 24);
  assertRestored(renderer);
  atlas.dispose();
});

test("a posed skinned avatar binds copied bones and leaves the original skeleton unchanged", async () => {
  const renderer = new CaptureRenderer();
  const root = new THREE.Group();
  root.name = "test avatar";
  const geometry = new THREE.BoxGeometry(0.5, 1.5, 0.3);
  const count = geometry.attributes.position.count;
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
  );
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  const bone = new THREE.Bone();
  bone.name = "body joint";
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  bone.rotation.z = 0.12;
  root.add(mesh);
  const originalPose = bone.quaternion.toArray();
  renderer.onAvatar = (copy) => {
    const copied = copy.children[0] as THREE.SkinnedMesh;
    assert.notEqual(copied.skeleton, mesh.skeleton);
    assert.notEqual(copied.skeleton.bones[0], bone);
    assert.equal(
      copied.skeleton.bones[0],
      copied.getObjectByName("body joint"),
    );
    assert.deepEqual(
      copied.skeleton.bones[0].quaternion.toArray(),
      originalPose,
    );
  };
  const atlas = await bakeDirectionalAtlas(renderer.asRenderer(), root, {
    tileSize: 64,
    yieldBetweenFrames: async () => {},
  });
  assert.deepEqual(bone.quaternion.toArray(), originalPose);
  assert.equal(bone.parent, mesh);
  atlas.dispose();
});

test("cancellation discards partial atlases and frees the renderer for a retry", async () => {
  const renderer = new CaptureRenderer();
  const { root } = avatar();
  const abort = new AbortController();
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), root, {
      tileSize: 64,
      signal: abort.signal,
      onProgress: (done) => {
        if (done === 4) abort.abort();
      },
      yieldBetweenFrames: async () => {},
    }),
    { name: "AbortError" },
  );
  assert.equal(renderer.rendered, 8);
  assert.equal(renderer.disposedTargets.size, 2);
  assertRestored(renderer);
  const atlas = await bakeDirectionalAtlas(renderer.asRenderer(), root, {
    tileSize: 64,
    yieldBetweenFrames: async () => {},
  });
  atlas.dispose();
});

test("capture rejects unready content and oversized or concurrent work before publishing an atlas", async () => {
  const renderer = new CaptureRenderer();
  const { root, texture } = avatar();
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), new THREE.Group()),
    /assembled/,
  );
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), root, { tileSize: 1024 }),
    /tile size/,
  );
  renderer.capabilities.maxTextureSize = 256;
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), root),
    /texture limit/,
  );
  renderer.capabilities.maxTextureSize = 4096;
  texture.source.data = { width: 0, height: 0 };
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), root),
    /not ready/,
  );
  texture.source.data = { width: 1, height: 1, data: new Uint8Array(4) };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const abort = new AbortController();
  const pending = bakeDirectionalAtlas(renderer.asRenderer(), root, {
    tileSize: 64,
    signal: abort.signal,
    yieldBetweenFrames: () => gate,
  });
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), root),
    /active directional capture/,
  );
  abort.abort();
  release();
  await assert.rejects(pending, { name: "AbortError" });
  assertRestored(renderer);
});

test("GPU failures restore renderer state and release all temporary resources", async () => {
  const renderer = new CaptureRenderer();
  const { root } = avatar();
  renderer.onAvatar = () => {
    throw Error("device render failed");
  };
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), root, { tileSize: 64 }),
    /device render failed/,
  );
  assertRestored(renderer);
  assert.equal(renderer.targets.size, renderer.disposedTargets.size);
  renderer.onAvatar = undefined;
  renderer.closed = true;
  await assert.rejects(
    bakeDirectionalAtlas(renderer.asRenderer(), root),
    /active graphics context/,
  );
});
