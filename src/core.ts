/** Serializable, renderer-independent appearance contract. Never contains account rights or executable code. */
export type Socket = {
  id: string;
  parent: string | null;
  position: [number, number, number];
};
export type Asset = {
  id: string;
  label: string;
  slot: string;
  rig: string;
  description: string;
  url: string;
  bytes: number;
  sha256: string;
  triangles: number;
  attachments: { node: string; socket: string }[];
  channels: string[];
  tags: string[];
  excludesTags?: string[];
  effect?: "orbit" | "spark";
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
  if (
    selected.length > catalog.budgets.maxParts ||
    selected.reduce((n, a) => n + a.bytes, 0) > catalog.budgets.maxBytes ||
    selected.reduce((n, a) => n + a.triangles, 0) > catalog.budgets.maxTriangles
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
    json.skins?.length ||
    json.animations?.length ||
    json.extensionsRequired?.length ||
    json.images?.length ||
    json.textures?.length ||
    !Array.isArray(json.buffers) ||
    json.buffers.length !== 1 ||
    json.buffers[0].uri !== undefined
  )
    fail("asset", "Expected a bounded self-contained rigid GLB");
  if (
    !Array.isArray(json.accessors) ||
    json.accessors.length > 1024 ||
    json.accessors.some(
      (a: any) =>
        !Number.isSafeInteger(a.count) || a.count < 0 || a.count > 150000,
    )
  )
    fail("asset", "Invalid accessor budget");
  let triangles = 0;
  for (const m of json.meshes)
    for (const p of m.primitives ?? []) {
      if ((p.mode ?? 4) !== 4) fail("asset", "Triangle meshes required");
      const count = json.accessors[p.indices ?? p.attributes?.POSITION]?.count;
      if (!count) fail("asset", "Missing mesh accessor");
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
