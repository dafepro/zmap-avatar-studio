import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { ComicStyle } from "../src/comic";
import {
  defaultRecipe,
  inspectGlb,
  validateCatalog,
  type Asset,
  type Catalog,
} from "../src/core";
import "./helpers/node-image";

/** Two-bone fixture with deliberately nonidentity authoring bases. */
function fixture(modify: (json: any) => void = () => {}) {
  const binary: Uint8Array[] = [],
    bufferViews: any[] = [],
    accessors: any[] = [];
  let byteLength = 0;
  const accessor = (
    array: Float32Array | Uint16Array | Uint8Array,
    type: string,
    count: number,
  ) => {
    const bytes = new Uint8Array(array.buffer);
    const padding = (4 - (byteLength % 4)) % 4;
    if (padding) {
      binary.push(new Uint8Array(padding));
      byteLength += padding;
    }
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: bytes.byteLength,
    });
    binary.push(bytes);
    byteLength += bytes.byteLength;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType:
        array instanceof Float32Array
          ? 5126
          : array instanceof Uint16Array
            ? 5123
            : 5121,
      type,
      count,
    });
    return accessors.length - 1;
  };
  const basis = new THREE.Matrix4().makeRotationY(0.73);
  const arm = basis
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(0, 1, 0))
    .multiply(new THREE.Matrix4().makeRotationZ(0.42));
  const attributes = {
    POSITION: accessor(
      new Float32Array([0, 1, 0, 1, 1, 0, 0, 2, 0]),
      "VEC3",
      3,
    ),
    JOINTS_0: accessor(
      new Uint8Array([0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      "VEC4",
      3,
    ),
    WEIGHTS_0: accessor(
      new Float32Array([0.5, 0.5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      "VEC4",
      3,
    ),
  };
  accessors[0].min = [0, 1, 0];
  accessors[0].max = [1, 2, 0];
  const indices = accessor(new Uint16Array([0, 1, 2]), "SCALAR", 3);
  const inverseBindMatrices = accessor(
    new Float32Array([
      ...basis.clone().invert().elements,
      ...arm.clone().invert().elements,
    ]),
    "MAT4",
    2,
  );
  // A minimal PNG header is sufficient for pre-decoder policy checks; the
  // production browser tests separately exercise complete PNG decoding.
  const png = new Uint8Array(36),
    pngView = new DataView(png.buffer);
  pngView.setUint32(0, 0x89504e47);
  pngView.setUint32(4, 0x0d0a1a0a);
  pngView.setUint32(8, 13);
  pngView.setUint32(12, 0x49484452);
  pngView.setUint32(16, 64);
  pngView.setUint32(20, 64);
  bufferViews.push({
    buffer: 0,
    byteOffset: byteLength,
    byteLength: png.length,
  });
  binary.push(png);
  byteLength += png.length;
  const json: any = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "body-test__root", children: [1, 3] },
      {
        name: "root",
        rotation: new THREE.Quaternion().setFromRotationMatrix(basis).toArray(),
        children: [2],
      },
      {
        name: "arm_R",
        translation: [0, 1, 0],
        rotation: new THREE.Quaternion()
          .setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.42)
          .toArray(),
      },
      { name: "surface", mesh: 0, skin: 0 },
    ],
    meshes: [{ primitives: [{ attributes, indices, material: 0 }] }],
    materials: [
      {
        name: "skin",
        pbrMetallicRoughness: { baseColorFactor: [0.7, 0.4, 0.2, 1] },
      },
    ],
    skins: [{ joints: [1, 2], inverseBindMatrices }],
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  modify(json);
  const jsonText = JSON.stringify(json),
    jsonBytes = new TextEncoder().encode(
      jsonText + " ".repeat((4 - (jsonText.length % 4)) % 4),
    );
  const binaryLength = Math.ceil(byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonBytes.length + 8 + binaryLength),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  const binaryHeader = 20 + jsonBytes.length;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  let at = binaryHeader + 8;
  for (const chunk of binary) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  const asset: Asset = {
    id: "body-test",
    label: "Weighted body",
    description: "Test",
    slot: "body",
    rig: "fixture",
    url: "models/body-test.glb",
    bytes: bytes.length,
    triangles: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    attachments: [{ node: "body-test__root", socket: "root" }],
    channels: ["skin"],
    tags: [],
    skin: { bones: ["root", "arm_R"] },
  };
  const catalog: Catalog = {
    version: 1,
    id: "fixture",
    revision: "1.0.0",
    rig: {
      id: "fixture",
      height: 2,
      sockets: [
        { id: "root", parent: null, position: [0, 0, 0] },
        { id: "arm_R", parent: "root", position: [0, 1, 0] },
      ],
    },
    base: asset.id,
    slots: [{ id: "hat", label: "Hat", required: false }],
    channels: ["skin"],
    assets: [asset],
    budgets: { maxTriangles: 100, maxBytes: 100000, maxParts: 2 },
  };
  return { bytes, asset, catalog };
}

test("smooth skins preserve arbitrary authoring bone bases, blended weights and independent instance poses", async () => {
  const { bytes, catalog } = fixture();
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async () => new Response(bytes),
  );
  const create = await library.prepare(defaultRecipe(catalog));
  const a = create(),
    b = create();
  let meshA!: THREE.SkinnedMesh, meshB!: THREE.SkinnedMesh;
  a.object.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) meshA = o;
  });
  b.object.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) meshB = o;
  });
  assert.ok(meshA && meshB);
  assert.notEqual(meshA.skeleton, meshB.skeleton);
  assert.notEqual(meshA.skeleton.bones[1], meshB.skeleton.bones[1]);
  a.object.updateMatrixWorld(true);
  b.object.updateMatrixWorld(true);
  const rest = meshA.getVertexPosition(1, new THREE.Vector3());
  assert.ok(
    rest.distanceTo(new THREE.Vector3(1, 1, 0)) < 1e-6,
    "rebind must leave the exported rest surface unchanged",
  );
  a.update(1, { gesture: "wave", reducedMotion: true });
  a.object.position.set(3, 0.4, -2);
  a.object.rotation.y = 0.6;
  a.object.scale.setScalar(1.5);
  a.object.updateMatrixWorld(true);
  const worldVertex = meshA
    .getVertexPosition(1, new THREE.Vector3())
    .applyMatrix4(meshA.matrixWorld);
  const arm = a.object.getObjectByName("arm_R")!;
  const expected = new THREE.Vector3(1, 0, 0).applyMatrix4(arm.matrixWorld);
  assert.ok(
    worldVertex.distanceTo(expected) < 1e-5,
    "posed vertex must follow the shared arm, including world transforms",
  );
  const blended = meshA
    .getVertexPosition(0, new THREE.Vector3())
    .applyMatrix4(meshA.matrixWorld);
  const expectedBlend = new THREE.Vector3(0, 1, 0)
    .applyMatrix4(a.object.getObjectByName("root")!.matrixWorld)
    .multiplyScalar(0.5)
    .add(new THREE.Vector3().applyMatrix4(arm.matrixWorld).multiplyScalar(0.5));
  assert.ok(
    blended.distanceTo(expectedBlend) < 1e-5,
    "two-bone shoulder weights preserve their weighted pose",
  );
  assert.ok(
    meshB.getVertexPosition(1, new THREE.Vector3()).distanceTo(rest) < 1e-6,
    "another avatar must keep its independent rest pose",
  );
  let disposed = 0;
  meshA.skeleton.computeBoneTexture();
  meshA.skeleton.boneTexture!.addEventListener("dispose", () => disposed++);
  a.dispose();
  assert.equal(disposed, 1, "instance disposal releases GPU bone texture once");
  assert.ok(b.diagnostics().triangles > 0);
  b.dispose();
  library.dispose();
});

test("source geometry budgets remain separate from the illustrated ink draw pass", async () => {
  const { bytes, catalog } = fixture();
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async () => new Response(bytes),
  );
  const avatar = library.create();
  await avatar.setAppearance(defaultRecipe(catalog));
  const style = new ComicStyle();
  style.update(avatar.object.children[0], new THREE.Vector2(600, 600));
  assert.equal(avatar.diagnostics().sourceTriangles, 1);
  assert.equal(avatar.diagnostics().triangles, 2);
  style.dispose();
  assert.equal(avatar.diagnostics().triangles, 1);
  avatar.dispose();
  library.dispose();
});

test("skin contract rejects undeclared joints, cycles, missing influences and off-rig rest positions", async () => {
  for (const change of [
    (json: any) => {
      json.nodes[2].name = "unapproved";
    },
    (json: any) => {
      json.nodes[2].children = [0];
    },
    (json: any) => {
      delete json.meshes[0].primitives[0].attributes.WEIGHTS_0;
    },
    (json: any) => {
      json.skins[0].joints = [1, 1];
    },
    (json: any) => {
      json.nodes[2].translation[1] = 1000;
    },
  ]) {
    const { bytes, asset } = fixture(change);
    assert.throws(() => inspectGlb(bytes.buffer, asset));
  }
  const rigid = fixture();
  delete rigid.asset.skin;
  assert.throws(() => inspectGlb(rigid.bytes.buffer, rigid.asset), /Skins/);
  const offset = fixture((json) => {
    json.nodes[2].translation[1] = 1.1;
  });
  const library = new AvatarLibrary(
    offset.catalog,
    "https://assets.test/",
    async () => new Response(offset.bytes),
  );
  await assert.rejects(
    library.create().setAppearance(defaultRecipe(offset.catalog)),
    /rest positions/,
  );
  library.dispose();
});

test("binary joint indices and weights are checked before the GLTF parser runs", () => {
  for (const malformed of ["joint", "sum", "nan"] as const) {
    const { bytes, asset } = fixture();
    const json = inspectGlb(bytes.buffer, asset),
      view = new DataView(bytes.buffer);
    const attributes = json.meshes[0].primitives[0].attributes;
    const accessor =
      json.accessors[
        attributes[malformed === "joint" ? "JOINTS_0" : "WEIGHTS_0"]
      ];
    const at =
      28 +
      view.getUint32(12, true) +
      json.bufferViews[accessor.bufferView].byteOffset;
    if (malformed === "joint") view.setUint8(at, 255);
    else view.setFloat32(at, malformed === "nan" ? NaN : 0.8, true);
    assert.throws(
      () => inspectGlb(bytes.buffer, asset),
      /Skin (influences|weights)/,
    );
  }
});

test("embedded artwork requires explicit budgets and rejects remote resources and oversized PNG dimensions", () => {
  const embedded = (json: any) => {
    json.images = [
      { mimeType: "image/png", bufferView: json.bufferViews.length - 1 },
    ];
    json.textures = [{ source: 0 }];
  };
  const { bytes, asset, catalog } = fixture(embedded);
  assert.throws(() => inspectGlb(bytes.buffer, asset), /budget/);
  asset.texture = { maxDimension: 64, maxCount: 1 };
  validateCatalog(catalog);
  inspectGlb(bytes.buffer, asset);
  asset.texture.maxDimension = 32;
  assert.throws(() => inspectGlb(bytes.buffer, asset), /dimensions/);
  asset.texture.maxDimension = 4096;
  assert.throws(() => validateCatalog(catalog), /texture budget/);
  for (const change of [
    (json: any) => {
      json.images[0].uri = "https://untrusted.test/face.png";
    },
    (json: any) => {
      json.images[0].mimeType = "image/jpeg";
    },
    (json: any) => {
      json.bufferViews.at(-1).byteOffset = 1000000;
    },
  ]) {
    const invalid = fixture((json) => {
      embedded(json);
      change(json);
    });
    invalid.asset.texture = { maxDimension: 64, maxCount: 1 };
    assert.throws(() => inspectGlb(invalid.bytes.buffer, invalid.asset));
  }
});

test("embedded artwork textures have independent instance ownership", async () => {
  const { bytes, asset, catalog } = fixture((json) => {
    json.images = [
      { mimeType: "image/png", bufferView: json.bufferViews.length - 1 },
    ];
    json.textures = [{ source: 0 }];
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  });
  asset.texture = { maxDimension: 64, maxCount: 1 };
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async () => new Response(bytes),
  );
  const create = await library.prepare(defaultRecipe(catalog));
  const a = create(),
    b = create();
  let textureA!: THREE.Texture, textureB!: THREE.Texture;
  for (const [instance, assign] of [
    [
      a,
      (value: THREE.Texture) => {
        textureA = value;
      },
    ],
    [
      b,
      (value: THREE.Texture) => {
        textureB = value;
      },
    ],
  ] as const)
    instance.object.traverse((object) => {
      if (object instanceof THREE.Mesh)
        assign((object.material as THREE.MeshStandardMaterial).map!);
    });
  assert.ok(textureA && textureB);
  assert.notEqual(textureA, textureB);
  assert.equal(textureA.image, textureB.image);
  let imageCloses = 0;
  textureA.image.close = () => imageCloses++;
  let disposalA = 0,
    disposalB = 0;
  textureA.addEventListener("dispose", () => disposalA++);
  textureB.addEventListener("dispose", () => disposalB++);
  library.dispose();
  await Promise.resolve();
  assert.equal(
    imageCloses,
    0,
    "a library must preserve bitmaps leased by live avatars",
  );
  a.dispose();
  assert.equal(disposalA, 1);
  assert.equal(disposalB, 0);
  assert.equal(imageCloses, 0);
  // A consuming scene may perform ordinary Three cleanup without preserving
  // the AvatarInstance handle; the underlying image lease must still end.
  textureB.dispose();
  assert.equal(disposalB, 1);
  assert.equal(
    imageCloses,
    1,
    "the last live texture releases its shared ImageBitmap",
  );
  b.dispose();
  assert.equal(
    imageCloses,
    1,
    "subsequent owner cleanup must not close an image twice",
  );
});

test("prepared factories retain their artwork after ordinary cache eviction", async (context) => {
  const { bytes, asset, catalog } = fixture((json) => {
    json.images = [
      { mimeType: "image/png", bufferView: json.bufferViews.length - 1 },
    ];
    json.textures = [{ source: 0 }];
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  });
  asset.texture = { maxDimension: 64, maxCount: 1 };
  for (let index = 0; index < 33; index++)
    catalog.assets.push({
      ...structuredClone(asset),
      id: `hat-${index}`,
      slot: "hat",
    });
  const images: { closed: number }[] = [];
  const decode = globalThis.createImageBitmap;
  context.mock.method(
    globalThis,
    "createImageBitmap",
    async (...args: Parameters<typeof createImageBitmap>) => {
      const image = await decode(...args),
        state = { closed: 0 };
      images.push(state);
      image.close = () => state.closed++;
      return image;
    },
  );
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async () => new Response(bytes),
  );
  const base = defaultRecipe(catalog),
    create = await library.prepare(base);
  for (let index = 0; index < 33; index++) {
    const avatar = library.create();
    await avatar.setAppearance({ ...base, parts: { hat: `hat-${index}` } });
    avatar.dispose();
  }
  assert.equal(library.diagnostics().cachedAssets, 32);
  assert.equal(library.diagnostics().preparedAssets, 1);
  assert.equal(
    images[0].closed,
    0,
    "eviction must retain the prepared base image",
  );
  const avatar = create();
  library.dispose();
  await Promise.resolve();
  assert.equal(
    images[0].closed,
    0,
    "the created avatar keeps its image after library disposal",
  );
  avatar.dispose();
  assert.ok(
    images.every((image) => image.closed === 1),
    "each decoded image closes exactly once after its last owner",
  );
});

test("a waiting appearance leases decoded artwork across concurrent cache eviction", async (context) => {
  const { bytes, asset, catalog } = fixture((json) => {
    json.images = [
      { mimeType: "image/png", bufferView: json.bufferViews.length - 1 },
    ];
    json.textures = [{ source: 0 }];
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  });
  asset.texture = { maxDimension: 64, maxCount: 1 };
  catalog.slots.push({ id: "shirt", label: "Shirt", required: false });
  catalog.budgets.maxParts = 3;
  for (let index = 0; index < 34; index++)
    catalog.assets.push({
      ...structuredClone(asset),
      id: `hat-${index}`,
      slot: "hat",
    });
  catalog.assets.push({
    ...structuredClone(asset),
    id: "late-shirt",
    slot: "shirt",
    url: "models/late.glb",
  });
  const decode = globalThis.createImageBitmap;
  context.mock.method(
    globalThis,
    "createImageBitmap",
    async (...args: Parameters<typeof createImageBitmap>) => {
      const image = (await decode(...args)) as ImageBitmap & {
        closed: boolean;
      };
      image.closed = false;
      image.close = () => {
        image.closed = true;
      };
      return image;
    },
  );
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async (input) => {
      if (String(input).endsWith("late.glb")) {
        started();
        await gate;
      }
      return new Response(bytes);
    },
  );
  const base = defaultRecipe(catalog),
    target = library.create();
  const pending = target.setAppearance({
    ...base,
    parts: { hat: "hat-0", shirt: "late-shirt" },
  });
  await waiting;
  for (let index = 1; index < 34; index++) {
    const other = library.create();
    await other.setAppearance({
      ...base,
      parts: { hat: `hat-${index}`, shirt: null },
    });
    other.dispose();
  }
  release();
  await pending;
  let maps = 0;
  target.object.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const map = (object.material as THREE.MeshStandardMaterial).map;
    if (map) {
      maps++;
      assert.equal(
        map.image.closed,
        false,
        "the waiting assembly must not clone a closed image",
      );
    }
  });
  assert.equal(maps, 3);
  target.dispose();
  library.dispose();
});

test("an image decode failure rejects the complete asset instead of silently dropping its artwork", async (context) => {
  const { bytes, asset, catalog } = fixture((json) => {
    json.images = [
      { mimeType: "image/png", bufferView: json.bufferViews.length - 1 },
    ];
    json.textures = [{ source: 0 }];
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  });
  asset.texture = { maxDimension: 64, maxCount: 1 };
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async () => new Response(bytes),
  );
  const avatar = library.create();
  context.mock.method(globalThis, "createImageBitmap", async () => {
    throw new Error("decode rejected");
  });
  context.mock.method(console, "error", () => {});
  await assert.rejects(
    avatar.setAppearance(defaultRecipe(catalog)),
    /artwork could not decode/,
  );
  assert.equal(avatar.object.children.length, 0);
  context.mock.restoreAll();
  await avatar.setAppearance(defaultRecipe(catalog));
  assert.ok(avatar.recipe);
  avatar.dispose();
  library.dispose();
});
