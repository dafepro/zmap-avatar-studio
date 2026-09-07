/** Serializable, renderer-independent appearance contract. Never contains account rights or executable code. */
export type Socket = {
  id: string;
  parent: string | null;
  position: [number, number, number];
};
export type AssetContent = {
  url: string;
  bytes: number;
  sha256: string;
  triangles: number;
  attachments: { node: string; socket: string }[];
};
/** Socket-local XY authoring frame: center X/Y, width, height. +Z faces forward. */
export type FitFrame = [number, number, number, number];
export type Asset = AssetContent & {
  id: string;
  label: string;
  slot: string;
  rig: string;
  description: string;
  channels: string[];
  tags: string[];
  excludesTags?: string[];
  /** Accessory-owned deformation volumes; no hairstyle-specific alternatives. */
  hairFit?: {
    targetSlot: string;
    center: [number, number, number];
    radii: [number, number, number];
    /** Contain a crown in an ellipsoid, or clear a box along -Z. */
    mode: "contain" | "clearance";
    axis?: "x" | "y" | "z";
    direction?: -1 | 1;
    transition?: [number, number];
  }[];
  surface?: { id: string; frame: FitFrame };
  fit?: {
    targetSlot: string;
    surface: string;
    frame: FitFrame;
    mode: "surface" | "clearance";
    offset: number;
    maxDistance: number;
  };
  effect?: "orbit" | "spark";
  /** A root-mounted deformable part; joint names refer to the shared catalog rig. */
  skin?: { bones: string[] };
  /** Explicit permission for bounded, embedded PNG artwork. URLs remain forbidden. */
  texture?: { maxDimension: number; maxCount: number };
};
export type Catalog = {
  version: 1;
  id: string;
  revision: string;
  rig: { id: string; height: number; sockets: Socket[] };
  base: string;
  slots: { id: string; label: string; required: boolean }[];
  channels: string[];
  assets: Asset[];
  budgets: { maxTriangles: number; maxBytes: number; maxParts: number };
};
export type Recipe = {
  version: 1;
  catalog: string;
  revision: string;
  rig: string;
  parts: Record<string, string | null>;
  colors: Record<string, string>;
};
export class AvatarError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AvatarError";
  }
}
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(v) &&
  !["__proto__", "prototype", "constructor"].includes(v);
const number = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const frame = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 4 &&
  v.slice(0, 2).every((n) => number(n, -1, 1)) &&
  v.slice(2).every((n) => number(n, 0.05, 1));
function fail(code: string, text: string): never {
  throw new AvatarError(code, text);
}
function keys(v: Record<string, any>, allowed: string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    fail("schema", "Unexpected field");
}
export function validateCatalog(input: unknown): asserts input is Catalog {
  if (!record(input)) fail("catalog", "Catalog must be an object");
  const c = input;
  if (
    c.version !== 1 ||
    !id(c.id) ||
    typeof c.revision !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(c.revision) ||
    !record(c.rig) ||
    !id(c.rig.id) ||
    !number(c.rig.height, 0.5, 3) ||
    !Array.isArray(c.rig.sockets) ||
    c.rig.sockets.length > 32
  )
    fail("catalog", "Unsupported catalog or rig");
  const sockets = new Set<string>();
  for (const s of c.rig.sockets) {
    if (
      !record(s) ||
      !id(s.id) ||
      sockets.has(s.id) ||
      !(s.parent === null ? sockets.size === 0 : sockets.has(s.parent)) ||
      !Array.isArray(s.position) ||
      s.position.length !== 3 ||
      !s.position.every((v: unknown) => number(v, -3, 3))
    )
      fail("rig", "Rig sockets must be unique and ordered parent first");
    sockets.add(s.id);
  }
  if (!sockets.has("root")) fail("rig", "Rig needs a root socket");
  if (
    !Array.isArray(c.slots) ||
    c.slots.length > 16 ||
    !c.slots.length ||
    !Array.isArray(c.channels) ||
    c.channels.length > 16 ||
    !c.channels.every(id) ||
    new Set(c.channels).size !== c.channels.length
  )
    fail("catalog", "Invalid slots or color channels");
  const slots = new Set<string>();
  for (const s of c.slots) {
    if (
      !record(s) ||
      !id(s.id) ||
      s.id === "body" ||
      slots.has(s.id) ||
      typeof s.label !== "string" ||
      s.label.length > 40 ||
      typeof s.required !== "boolean"
    )
      fail("catalog", "Invalid slot");
    slots.add(s.id);
  }
  if (
    !record(c.budgets) ||
    !number(c.budgets.maxTriangles, 1, 50000) ||
    !number(c.budgets.maxBytes, 1, 4000000) ||
    !number(c.budgets.maxParts, 1, 17)
  )
    fail("budget", "Invalid catalog budgets");
  if (!Array.isArray(c.assets) || c.assets.length > 128 || !c.assets.length)
    fail("catalog", "Invalid asset list");
  const assets = new Set<string>();
  for (const a of c.assets) {
    if (
      !record(a) ||
      !id(a.id) ||
      assets.has(a.id) ||
      !(slots.has(a.slot) || a.slot === "body") ||
      a.rig !== c.rig.id ||
      typeof a.label !== "string" ||
      a.label.length > 60 ||
      typeof a.description !== "string" ||
      a.description.length > 300 ||
      typeof a.url !== "string" ||
      !/^models\/[a-zA-Z0-9_-]+\.glb$/.test(a.url) ||
      !Number.isSafeInteger(a.bytes) ||
      !number(a.bytes, 20, 1500000) ||
      !Number.isSafeInteger(a.triangles) ||
      !number(a.triangles, 1, 50000) ||
      typeof a.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(a.sha256)
    )
      fail("asset", "Invalid asset contract");
    if (
      !Array.isArray(a.attachments) ||
      !a.attachments.length ||
      a.attachments.length > 32 ||
      new Set(a.attachments.map((v: any) => v?.node)).size !==
        a.attachments.length ||
      !a.attachments.every(
        (v: any) => record(v) && id(v.node) && sockets.has(v.socket),
      )
    )
      fail("asset", "Invalid attachment contract");
    if (
      !Array.isArray(a.channels) ||
      !a.channels.every((v: any) => c.channels.includes(v)) ||
      !Array.isArray(a.tags) ||
      a.tags.length > 20 ||
      !a.tags.every(id) ||
      (a.excludesTags !== undefined &&
        (!Array.isArray(a.excludesTags) ||
          a.excludesTags.length > 20 ||
          !a.excludesTags.every(id)))
    )
      fail("asset", "Invalid material or compatibility tags");
    if (a.effect !== undefined && !["orbit", "spark"].includes(a.effect))
      fail("asset", "Unsupported effect");
    if (
      a.hairFit !== undefined &&
      (!Array.isArray(a.hairFit) ||
        a.hairFit.length > 4 ||
        !a.hairFit.every(
          (v: any) =>
            record(v) &&
            slots.has(v.targetSlot) &&
            v.targetSlot !== a.slot &&
            ["contain", "clearance"].includes(v.mode) &&
            Array.isArray(v.center) &&
            v.center.length === 3 &&
            v.center.every((n: unknown) => number(n, -1, 1)) &&
            Array.isArray(v.radii) &&
            v.radii.length === 3 &&
            v.radii.every((n: unknown) => number(n, 0.005, 1)) &&
            (v.mode === "contain"
              ? Array.isArray(v.transition) &&
                v.transition.length === 2 &&
                v.transition.every((n: unknown) => number(n, -1, 1)) &&
                v.transition[1] - v.transition[0] >= 0.01 &&
                v.transition[1] <= v.center[1] &&
                v.axis === undefined &&
                v.direction === undefined
              : v.transition === undefined &&
                (v.axis === undefined || ["x", "y", "z"].includes(v.axis)) &&
                (v.direction === undefined || [-1, 1].includes(v.direction))),
        ))
    )
      fail("asset", "Invalid accessory deformation volume");
    if (
      a.hairFit &&
      (a.skin ||
        a.attachments.length !== 1 ||
        a.attachments[0].socket !== "head")
    )
      fail(
        "asset",
        "Accessory deformation volumes require one rigid head attachment",
      );
    if (
      (a.surface !== undefined || a.fit !== undefined) &&
      (a.skin ||
        a.attachments.length !== 1 ||
        a.attachments[0].socket !== "head")
    )
      fail("asset", "Fitted surfaces require one rigid head attachment");
    if (
      a.surface !== undefined &&
      (!record(a.surface) ||
        !id(a.surface.id) ||
        !frame(a.surface.frame) ||
        a.fit !== undefined)
    )
      fail("asset", "Invalid fitting surface");
    if (
      a.fit !== undefined &&
      (!record(a.fit) ||
        !slots.has(a.fit.targetSlot) ||
        a.fit.targetSlot === a.slot ||
        !id(a.fit.surface) ||
        !frame(a.fit.frame) ||
        !["surface", "clearance"].includes(a.fit.mode) ||
        !number(a.fit.offset, 0.0005, 0.03) ||
        !number(a.fit.maxDistance, 0.001, 0.15))
    )
      fail("asset", "Invalid surface fitting contract");
    if (
      a.skin !== undefined &&
      (!record(a.skin) ||
        !Array.isArray(a.skin.bones) ||
        !a.skin.bones.length ||
        a.skin.bones.length > 32 ||
        new Set(a.skin.bones).size !== a.skin.bones.length ||
        !a.skin.bones.every((bone: unknown) => sockets.has(bone as string)) ||
        a.attachments.length !== 1 ||
        a.attachments[0].socket !== "root")
    )
      fail(
        "asset",
        "Skinned parts need declared rig bones and one root attachment",
      );
    if (
      a.texture !== undefined &&
      (!record(a.texture) ||
        !Number.isSafeInteger(a.texture.maxDimension) ||
        !number(a.texture.maxDimension, 1, 2048) ||
        !Number.isSafeInteger(a.texture.maxCount) ||
        !number(a.texture.maxCount, 1, 4))
    )
      fail("asset", "Invalid embedded texture budget");
    assets.add(a.id);
  }
  for (const slot of c.slots)
    if (slot.required && !c.assets.some((a: Asset) => a.slot === slot.id))
      fail("catalog", "Required slot has no parts");
  if (!c.assets.some((a: Asset) => a.id === c.base && a.slot === "body"))
    fail("catalog", "Catalog needs a compatible base body");
}
export function validateRecipe(
  input: unknown,
  catalog: Catalog,
): asserts input is Recipe {
  if (!record(input)) fail("recipe", "Appearance must be an object");
  keys(input, ["version", "catalog", "revision", "rig", "parts", "colors"]);
  if (
    input.version !== 1 ||
    input.catalog !== catalog.id ||
    input.revision !== catalog.revision ||
    input.rig !== catalog.rig.id
  )
    fail("version", "Appearance needs the matching catalog and rig version");
  if (!record(input.parts) || !record(input.colors))
    fail("recipe", "Appearance needs parts and colors");
  keys(
    input.parts,
    catalog.slots.map((s) => s.id),
  );
  keys(input.colors, catalog.channels);
  const selected: Asset[] = [
    catalog.assets.find((a) => a.id === catalog.base)!,
  ];
  for (const slot of catalog.slots) {
    const value = input.parts[slot.id];
    if (value === null && !slot.required) continue;
    const a = catalog.assets.find((a) => a.id === value && a.slot === slot.id);
    if (!a)
      fail("part", `Choose a compatible ${slot.label.toLowerCase()} part`);
    selected.push(a);
  }
  for (const [channel, color] of Object.entries(input.colors))
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))
      fail("color", `Invalid ${channel} color`);
  const tags = new Set(selected.flatMap((a) => a.tags));
  if (selected.some((a) => a.excludesTags?.some((t) => tags.has(t))))
    fail("compatibility", "These parts cannot be worn together");
  for (const asset of selected) {
    if (
      asset.fit &&
      !selected.some(
        (p) =>
          p.slot === asset.fit!.targetSlot &&
          p.surface?.id === asset.fit!.surface,
      )
    )
      fail(
        "compatibility",
        `${asset.label} needs a compatible fitting surface`,
      );
  }
  const resolved = selected;
  if (
    selected.length > catalog.budgets.maxParts ||
    resolved.reduce((n, a) => n + a.bytes, 0) > catalog.budgets.maxBytes ||
    resolved.reduce((n, a) => n + a.triangles, 0) > catalog.budgets.maxTriangles
  )
    fail("budget", "Appearance exceeds the catalog resource budget");
}
export function parseRecipe(text: string, catalog: Catalog): Recipe {
  if (text.length > 16000) fail("recipe", "Appearance file is too large");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail("recipe", "Appearance file is not valid JSON");
  }
  validateRecipe(value, catalog);
  return structuredClone(value);
}
export function selectedAssets(recipe: Recipe, catalog: Catalog): Asset[] {
  validateRecipe(recipe, catalog);
  return [
    catalog.base,
    ...Object.values(recipe.parts).filter((id): id is string => id !== null),
  ].map((id) => catalog.assets.find((a) => a.id === id)!);
}
export function defaultRecipe(catalog: Catalog): Recipe {
  return {
    version: 1,
    catalog: catalog.id,
    revision: catalog.revision,
    rig: catalog.rig.id,
    parts: Object.fromEntries(
      catalog.slots.map((s) => [
        s.id,
        s.required ? catalog.assets.find((a) => a.slot === s.id)!.id : null,
      ]),
    ),
    colors: {},
  };
}
export function recipeKey(recipe: Recipe): string {
  return JSON.stringify({
    ...recipe,
    parts: Object.fromEntries(Object.entries(recipe.parts).sort()),
    colors: Object.fromEntries(Object.entries(recipe.colors).sort()),
  });
}
/** Reject external resources before GLTFLoader gets a chance to fetch them. */
export function inspectGlb(data: ArrayBuffer, asset: Asset) {
  const view = new DataView(data);
  if (
    data.byteLength !== asset.bytes ||
    data.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== data.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    fail("asset", "Invalid GLB header or length");
  const length = view.getUint32(12, true);
  if (length > data.byteLength - 20) fail("asset", "Invalid GLB JSON length");
  let json: any;
  try {
    json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(data, 20, length)),
    );
  } catch {
    fail("asset", "Invalid GLB JSON");
  }
  if (
    !record(json) ||
    !Array.isArray(json.nodes) ||
    json.nodes.length > 256 ||
    !Array.isArray(json.meshes) ||
    json.meshes.length > 128 ||
    json.animations?.length ||
    json.extensionsRequired?.length ||
    !Array.isArray(json.buffers) ||
    json.buffers.length !== 1 ||
    json.buffers[0].uri !== undefined
  )
    fail("asset", "Expected a bounded self-contained GLB");
  const binaryHeader = 20 + length;
  if (
    binaryHeader + 8 > data.byteLength ||
    view.getUint32(binaryHeader + 4, true) !== 0x004e4942 ||
    binaryHeader + 8 + view.getUint32(binaryHeader, true) !== data.byteLength ||
    !Number.isSafeInteger(json.buffers[0].byteLength) ||
    json.buffers[0].byteLength > view.getUint32(binaryHeader, true) ||
    !Array.isArray(json.bufferViews) ||
    json.bufferViews.length > 1024
  )
    fail("asset", "Invalid embedded binary buffer");
  const binaryOffset = binaryHeader + 8;
  for (const buffer of json.bufferViews)
    if (
      !record(buffer) ||
      buffer.buffer !== 0 ||
      !Number.isSafeInteger(buffer.byteOffset ?? 0) ||
      (buffer.byteOffset ?? 0) < 0 ||
      !Number.isSafeInteger(buffer.byteLength) ||
      buffer.byteLength < 0 ||
      (buffer.byteOffset ?? 0) + buffer.byteLength > json.buffers[0].byteLength
    )
      fail("asset", "Invalid embedded buffer view");
  if (
    !Array.isArray(json.accessors) ||
    json.accessors.length > 1024 ||
    json.accessors.some(
      (a: any) =>
        !Number.isSafeInteger(a.count) || a.count < 0 || a.count > 150000,
    )
  )
    fail("asset", "Invalid accessor budget");
  const componentBytes: Record<number, number> = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
  };
  const components: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT4: 16,
  };
  for (const accessor of json.accessors) {
    const buffer = json.bufferViews[accessor.bufferView];
    const elementBytes =
      componentBytes[accessor.componentType] * components[accessor.type];
    const stride = buffer?.byteStride ?? elementBytes;
    if (
      !Number.isInteger(accessor.bufferView) ||
      !buffer ||
      !elementBytes ||
      accessor.sparse !== undefined ||
      !Number.isSafeInteger(accessor.byteOffset ?? 0) ||
      (accessor.byteOffset ?? 0) < 0 ||
      !Number.isSafeInteger(stride) ||
      stride < elementBytes ||
      stride > 252 ||
      (accessor.byteOffset ?? 0) +
        (accessor.count ? (accessor.count - 1) * stride + elementBytes : 0) >
        buffer.byteLength
    )
      fail("asset", "Accessor exceeds its embedded binary view");
  }
  const readComponent = (accessor: any, element: number, component: number) => {
    const buffer = json.bufferViews[accessor.bufferView],
      bytes = componentBytes[accessor.componentType];
    const at =
      binaryOffset +
      (buffer.byteOffset ?? 0) +
      (accessor.byteOffset ?? 0) +
      element * (buffer.byteStride ?? bytes * components[accessor.type]) +
      component * bytes;
    switch (accessor.componentType) {
      case 5121:
        return view.getUint8(at) / (accessor.normalized ? 255 : 1);
      case 5123:
        return view.getUint16(at, true) / (accessor.normalized ? 65535 : 1);
      case 5126:
        return view.getFloat32(at, true);
      default:
        return NaN;
    }
  };
  const images = json.images ?? [],
    textures = json.textures ?? [];
  if (
    !Array.isArray(images) ||
    !Array.isArray(textures) ||
    images.length > (asset.texture?.maxCount ?? 0) ||
    textures.length > (asset.texture?.maxCount ?? 0) ||
    textures.some(
      (texture: any) =>
        !record(texture) ||
        !Number.isInteger(texture.source) ||
        !images[texture.source] ||
        texture.extensions !== undefined,
    )
  )
    fail("asset", "Textures must fit the declared embedded image budget");
  for (const image of images) {
    const buffer = json.bufferViews[image?.bufferView];
    if (
      !record(image) ||
      image.uri !== undefined ||
      image.mimeType !== "image/png" ||
      !Number.isInteger(image.bufferView) ||
      !buffer ||
      buffer.byteLength < 33
    )
      fail("asset", "Only embedded PNG artwork is supported");
    const at = binaryOffset + (buffer.byteOffset ?? 0);
    if (
      view.getUint32(at) !== 0x89504e47 ||
      view.getUint32(at + 4) !== 0x0d0a1a0a ||
      view.getUint32(at + 8) !== 13 ||
      view.getUint32(at + 12) !== 0x49484452 ||
      !number(view.getUint32(at + 16), 1, asset.texture!.maxDimension) ||
      !number(view.getUint32(at + 20), 1, asset.texture!.maxDimension)
    )
      fail(
        "asset",
        "Embedded PNG exceeds the declared dimensions or has an invalid header",
      );
  }
  const skins = json.skins ?? [];
  if (
    !Array.isArray(skins) ||
    skins.length > (asset.skin ? 4 : 0) ||
    (asset.skin && !skins.length)
  )
    fail("asset", "Skins require an explicit bounded joint contract");
  const parents = new Map<number, number>();
  for (const [index, node] of json.nodes.entries()) {
    if (
      !record(node) ||
      (node.children !== undefined && !Array.isArray(node.children))
    )
      fail("asset", "Invalid node hierarchy");
    for (const [field, size] of [
      ["translation", 3],
      ["rotation", 4],
      ["scale", 3],
      ["matrix", 16],
    ] as const)
      if (
        node[field] !== undefined &&
        (!Array.isArray(node[field]) ||
          node[field].length !== size ||
          !node[field].every((value: unknown) => number(value, -100, 100)))
      )
        fail("asset", "Node transforms must be finite and bounded");
    for (const child of node.children ?? []) {
      if (
        !Number.isInteger(child) ||
        child < 0 ||
        child >= json.nodes.length ||
        parents.has(child)
      )
        fail("asset", "Nodes need one valid parent");
      parents.set(child, index);
    }
    if (
      node.skin !== undefined &&
      (!Number.isInteger(node.skin) ||
        !skins[node.skin] ||
        node.mesh === undefined)
    )
      fail("asset", "Invalid mesh skin reference");
  }
  for (let index = 0; index < json.nodes.length; index++) {
    const seen = new Set<number>();
    let current: number | undefined = index;
    while (current !== undefined) {
      if (seen.has(current)) fail("asset", "Cyclic node hierarchy");
      seen.add(current);
      current = parents.get(current);
    }
  }
  if (asset.skin) {
    const attachment = json.nodes.findIndex(
      (node: any) => node.name === asset.attachments[0].node,
    );
    const descendant = (index: number) => {
      let current: number | undefined = index;
      while (current !== undefined) {
        if (current === attachment) return true;
        current = parents.get(current);
      }
      return false;
    };
    for (const skin of skins) {
      const inverse = json.accessors[skin?.inverseBindMatrices];
      if (
        !record(skin) ||
        !Array.isArray(skin.joints) ||
        !skin.joints.length ||
        skin.joints.length > asset.skin.bones.length ||
        new Set(skin.joints).size !== skin.joints.length ||
        !skin.joints.every(
          (joint: number) =>
            Number.isInteger(joint) &&
            descendant(joint) &&
            asset.skin!.bones.includes(json.nodes[joint]?.name),
        ) ||
        new Set(skin.joints.map((joint: number) => json.nodes[joint].name))
          .size !== skin.joints.length ||
        !inverse ||
        inverse.type !== "MAT4" ||
        inverse.componentType !== 5126 ||
        inverse.count !== skin.joints.length
      )
        fail(
          "asset",
          "Skin joints and bind matrices must match the declared rig",
        );
      for (let element = 0; element < inverse.count; element++)
        for (let component = 0; component < 16; component++)
          if (!number(readComponent(inverse, element, component), -100, 100))
            fail("asset", "Skin bind matrices must be finite and bounded");
    }
    for (const [index, node] of json.nodes.entries())
      if (node.skin !== undefined) {
        if (!descendant(index))
          fail("asset", "Skinned meshes must belong to their root attachment");
        for (const primitive of json.meshes[node.mesh]?.primitives ?? []) {
          const indices = json.accessors[primitive.attributes?.JOINTS_0],
            weights = json.accessors[primitive.attributes?.WEIGHTS_0];
          if (
            !indices ||
            !weights ||
            indices.type !== "VEC4" ||
            weights.type !== "VEC4" ||
            ![5121, 5123].includes(indices.componentType) ||
            indices.normalized ||
            ![5121, 5123, 5126].includes(weights.componentType) ||
            (weights.componentType !== 5126 && !weights.normalized) ||
            indices.count !== weights.count
          )
            fail(
              "asset",
              "Skinned meshes need matching joint indices and normalized weights",
            );
          for (let vertex = 0; vertex < indices.count; vertex++) {
            let sum = 0;
            for (let component = 0; component < 4; component++) {
              const joint = readComponent(indices, vertex, component),
                weight = readComponent(weights, vertex, component);
              if (
                !Number.isInteger(joint) ||
                joint < 0 ||
                joint >= skins[node.skin].joints.length ||
                !number(weight, 0, 1)
              )
                fail(
                  "asset",
                  "Skin influences exceed the joint or weight bounds",
                );
              sum += weight;
            }
            if (Math.abs(sum - 1) > 0.002)
              fail("asset", "Skin weights must sum to one");
          }
        }
      }
  }
  let triangles = 0;
  for (const m of json.meshes)
    for (const p of m.primitives ?? []) {
      if ((p.mode ?? 4) !== 4) fail("asset", "Triangle meshes required");
      const count = json.accessors[p.indices ?? p.attributes?.POSITION]?.count;
      if (!count) fail("asset", "Missing mesh accessor");
      if (
        p.attributes?.JOINTS_0 !== undefined ||
        p.attributes?.WEIGHTS_0 !== undefined
      ) {
        const joints = json.accessors[p.attributes.JOINTS_0],
          weights = json.accessors[p.attributes.WEIGHTS_0],
          positions = json.accessors[p.attributes.POSITION];
        if (
          !asset.skin ||
          !joints ||
          !weights ||
          joints.type !== "VEC4" ||
          weights.type !== "VEC4" ||
          ![5121, 5123].includes(joints.componentType) ||
          ![5121, 5123, 5126].includes(weights.componentType) ||
          joints.count !== positions?.count ||
          weights.count !== positions.count ||
          p.attributes.JOINTS_1 !== undefined ||
          p.attributes.WEIGHTS_1 !== undefined
        )
          fail(
            "asset",
            "Skin attributes require four bounded influences per vertex",
          );
      }
      triangles += count / 3;
    }
  if (triangles !== asset.triangles)
    fail("asset", "Triangle count differs from approved manifest");
  for (const attachment of asset.attachments) {
    if (json.nodes.filter((n: any) => n.name === attachment.node).length !== 1)
      fail("asset", `Missing unique attachment ${attachment.node}`);
  }
  return json;
}
