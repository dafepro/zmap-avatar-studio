/** Rebuild standalone collection metadata and importable SHIFT look. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { defaultRecipe, type Catalog } from "../src/core";
import { emptyWieldLoadout, type WieldCatalog } from "../src/wield-core";
const root = new URL("../public/", import.meta.url);
const catalog: Catalog = JSON.parse(
  await readFile(new URL("capsule/catalog.json", root), "utf8"),
);
const wield: WieldCatalog = JSON.parse(
  await readFile(new URL("wield/catalog.json", root), "utf8"),
);
const components = [
  { slot: "headwear", id: "hat-sunline-visor", label: "Sunline open visor" },
  {
    slot: "shirt",
    id: "shirt-sunline-courier",
    label: "Sunline stepped jacket",
  },
  {
    slot: "bottom",
    id: "bottom-sunline-cargo",
    label: "Sunline tapered cargo",
  },
  {
    slot: "shoes",
    id: "shoes-sunline-track",
    label: "Sunline split track trainers",
  },
  {
    slot: "accessory",
    id: "acc-sunline-envelope",
    label: "Sunline envelope pack",
  },
];
const palette = {
  primary: "#e97552",
  secondary: "#303643",
  trim: "#f4e8cf",
  accent: "#d4e951",
};
const appearance = defaultRecipe(catalog);
Object.assign(
  appearance.parts,
  Object.fromEntries(components.map((part) => [part.slot, part.id])),
  { head: "head-scout", hair: "hair-sweep", face: "face-grin" },
);
Object.assign(appearance.colors, palette, { skin: "#cb9472", hair: "#303643" });
appearance.body = { weight: 0 };
const manifest = {
  format: "shift-collectible-set",
  version: 1,
  id: "sunline-courier",
  label: "SUNLINE COURIER",
  description:
    "Five independently equippable courier pieces: angular open visor, stepped long-sleeve jacket, tapered cargo trousers, split-front track trainers and folded envelope backpack.",
  components,
  palette,
  look: "../looks/sunline-courier.shift.json",
};
await mkdir(new URL("capsule/sets/", root), { recursive: true });
await mkdir(new URL("capsule/looks/", root), { recursive: true });
await writeFile(
  new URL("capsule/sets/sunline-courier.json", root),
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  new URL("capsule/looks/sunline-courier.shift.json", root),
  JSON.stringify(
    {
      format: "shift-look",
      version: 1,
      name: "Sunline Courier",
      appearance,
      equipment: emptyWieldLoadout(wield),
    },
    null,
    2,
  ) + "\n",
);
