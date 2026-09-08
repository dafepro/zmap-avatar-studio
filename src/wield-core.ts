import { AvatarError, type Asset } from "./core.js";

/** Equipment is separate from appearance: two hands never multiply saved looks. */
export type Hand = "left" | "right";
export type Euler3 = [number, number, number];
export type HandPose = { arm: Euler3; forearm: Euler3; wrist: Euler3 };
export type WieldAsset = {
  id: string;
  label: string;
  url: string;
  bytes: number;
  sha256: string;
  triangles: number;
  /** A single root containing all rendered geometry and named anchors. */
  node: string;
};
export type WieldGrip = WieldAsset & {
  hand: Hand;
  frame: { position: Euler3; rotation: Euler3 };
};
export type TwoHandedHold = {
  grips: Record<Hand, string>;
  hold: { socket: "chest"; position: Euler3; rotation: Euler3 };
};
export type WieldItem = WieldAsset & {
  /** A trusted, app-registered factory key; never executable manifest content. */
  behavior: string;
  gripAnchor: string;
  anchors: Record<string, string>;
  pose: Record<Hand, HandPose>;
  /** One shared model with physical grip frames; legacy pose is unused in this mode. */
  twoHanded?: TwoHandedHold;
};
export type WieldCatalog = {
  version: 1;
  id: string;
  revision: string;
  rig: string;
  grips: Record<Hand, WieldGrip>;
  items: WieldItem[];
};
export type WieldLoadout = {
  version: 1;
  catalog: string;
  revision: string;
  rig: string;
  left: string | null;
  right: string | null;
  /** Occupies both hands; ordinary left/right slots must be null. */
  twoHanded?: { item: string; primary: Hand };
};
export const WIELD_LIMITS = Object.freeze({
  item: 600,
  twoHandItem: 1200,
  grip: 500,
  held: 2200,
  heldBytes: 200000,
  effects: 512,
  visible: 16000,
  eventsPerFrame: 32,
});
export const HANDS: readonly Hand[] = ["left", "right"];
const validId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[A-Za-z0-9_-]{1,80}$/.test(v) &&
  !["__proto__", "prototype", "constructor"].includes(v);
const record = (v: unknown): v is Record<string, any> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v));
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AvatarError("wield", message);
}
function keys(value: unknown, required: string[], optional: string[] = []) {
  require(record(value), "Expected a plain equipment record");
  require(required.every((k) =>
    Object.hasOwn(value, k),
  ), "Missing equipment field");
  require(Object.keys(value).every(
    (k) => required.includes(k) || optional.includes(k),
  ), "Unknown equipment field");
}
export function validateEuler(
  value: unknown,
  bound = Math.PI,
): asserts value is Euler3 {
  require(Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (v) =>
        typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= bound,
    ), "Invalid bounded equipment transform");
}
export function validateHandPose(value: unknown): asserts value is HandPose {
  keys(value, ["arm", "forearm", "wrist"]);
  for (const part of ["arm", "forearm", "wrist"])
    validateEuler((value as any)[part]);
}
const common = ["id", "label", "url", "bytes", "sha256", "triangles", "node"];
function validateAsset(value: any, triangleLimit: number) {
  require(validId(value.id) &&
    validId(value.node), "Invalid equipment identifier or root");
  require(typeof value.label === "string" &&
    value.label.length > 0 &&
    value.label.length <= 120, "Invalid equipment label");
  require(typeof value.url === "string" &&
    /^models\/[A-Za-z0-9_-]+\.glb$/.test(
      value.url,
    ), "Equipment URL must be a local approved model");
  require(Number.isSafeInteger(value.bytes) &&
    value.bytes >= 20 &&
    value.bytes <= WIELD_LIMITS.heldBytes, "Equipment byte budget exceeded");
  require(typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256), "Invalid equipment integrity digest");
  require(Number.isSafeInteger(value.triangles) &&
    value.triangles >= 1 &&
    value.triangles <= triangleLimit, "Equipment triangle budget exceeded");
}
export function validateWieldCatalog(
  value: unknown,
): asserts value is WieldCatalog {
  keys(value, ["version", "id", "revision", "rig", "grips", "items"]);
  const c = value as WieldCatalog;
  require(c.version === 1 &&
    validId(c.id) &&
    validId(c.rig), "Unsupported equipment catalog");
  require(typeof c.revision === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(
      c.revision,
    ), "Invalid equipment revision");
  keys(c.grips, [...HANDS]);
  const ids = new Set<string>();
  for (const hand of HANDS) {
    const grip = c.grips[hand];
    keys(grip, [...common, "hand", "frame"]);
    validateAsset(grip, WIELD_LIMITS.grip);
    require(grip.hand === hand, "Grip side disagrees with its hand slot");
    keys(grip.frame, ["position", "rotation"]);
    validateEuler(grip.frame.position, 0.3);
    validateEuler(grip.frame.rotation);
    require(!ids.has(grip.id), "Duplicate equipment identifier");
    ids.add(grip.id);
  }
  require(Array.isArray(c.items) &&
    c.items.length > 0 &&
    c.items.length <= 128, "Invalid bounded equipment collection");
  for (const item of c.items) {
    keys(
      item,
      [...common, "behavior", "gripAnchor", "anchors", "pose"],
      ["twoHanded"],
    );
    validateAsset(
      item,
      item.twoHanded ? WIELD_LIMITS.twoHandItem : WIELD_LIMITS.item,
    );
    require(validId(item.behavior) &&
      validId(item.gripAnchor), "Invalid equipment behavior or grip anchor");
    require(record(item.anchors) &&
      Object.keys(item.anchors).length <= 16 &&
      Object.entries(item.anchors).every(
        ([key, node]) => validId(key) && key !== "grip" && validId(node),
      ), "Invalid equipment anchors");
    require(new Set([item.gripAnchor, ...Object.values(item.anchors)]).size ===
      Object.keys(item.anchors).length +
        1, "Equipment anchors must name distinct nodes");
    if (Object.hasOwn(item, "twoHanded")) {
      keys(item.twoHanded, ["grips", "hold"]);
      const two = item.twoHanded!;
      keys(two.grips, [...HANDS]);
      require(validId(two.grips.left) &&
        validId(two.grips.right) &&
        two.grips.left !==
          two.grips
            .right, "Two-handed grips must name distinct physical frames");
      require(Object.values(two.grips).includes(
        item.gripAnchor,
      ), "Main grip must belong to the two-handed grip mapping");
      require(!Object.values(item.anchors).some((node) =>
        Object.values(two.grips).includes(node),
      ), "Auxiliary anchors must not duplicate two-handed grips");
      keys(two.hold, ["socket", "position", "rotation"]);
      require(two.hold.socket ===
        "chest", "Two-handed equipment uses the shared chest frame");
      validateEuler(two.hold.position, 0.75);
      validateEuler(two.hold.rotation);
    }
    require(!ids.has(item.id), "Duplicate equipment identifier");
    ids.add(item.id);
    keys(item.pose, [...HANDS]);
    for (const hand of HANDS) validateHandPose(item.pose[hand]);
  }
}
export function emptyWieldLoadout(catalog: WieldCatalog): WieldLoadout {
  return {
    version: 1,
    catalog: catalog.id,
    revision: catalog.revision,
    rig: catalog.rig,
    left: null,
    right: null,
  };
}
export function validateWieldLoadout(
  value: unknown,
  catalog: WieldCatalog,
): asserts value is WieldLoadout {
  keys(
    value,
    ["version", "catalog", "revision", "rig", ...HANDS],
    ["twoHanded"],
  );
  const loadout = value as WieldLoadout;
  require(loadout.version === 1 &&
    loadout.catalog === catalog.id &&
    loadout.revision === catalog.revision &&
    loadout.rig ===
      catalog.rig, "Equipment loadout does not match this catalog and rig");
  let triangles = 0,
    bytes = 0;
  for (const hand of HANDS) {
    const id = loadout[hand];
    require(id === null || validId(id), "Invalid held item identifier");
    if (id === null) continue;
    const item = catalog.items.find((asset) => asset.id === id);
    require(item, `Unknown held item ${id}`);
    require(!item.twoHanded, "Two-handed equipment cannot occupy an independent hand slot");
    triangles += item.triangles + catalog.grips[hand].triangles;
    bytes += item.bytes + catalog.grips[hand].bytes;
  }
  if (Object.hasOwn(loadout, "twoHanded")) {
    keys(loadout.twoHanded, ["item", "primary"]);
    const two = loadout.twoHanded!;
    require(loadout.left === null &&
      loadout.right === null, "Two-handed equipment occupies both hand slots");
    require(validId(two.item) &&
      HANDS.includes(two.primary), "Invalid two-handed item or primary hand");
    const item = catalog.items.find((asset) => asset.id === two.item);
    require(item?.twoHanded, "Loadout requires an approved two-handed item");
    triangles =
      item.triangles +
      catalog.grips.left.triangles +
      catalog.grips.right.triangles;
    bytes = item.bytes + catalog.grips.left.bytes + catalog.grips.right.bytes;
  }
  require(triangles <= WIELD_LIMITS.held &&
    bytes <= WIELD_LIMITS.heldBytes, "Held equipment budget exceeded");
}
/** Adapter into the same integrity/embedded-content policy used for appearance. */
export function wieldAssetDescriptor(asset: WieldAsset, rig: string): Asset {
  return {
    id: asset.id,
    label: asset.label,
    url: asset.url,
    bytes: asset.bytes,
    sha256: asset.sha256,
    triangles: asset.triangles,
    attachments: [{ node: asset.node, socket: "root" }],
    rig,
    slot: "wield",
    description: asset.label,
    channels: [],
    tags: [],
  };
}
