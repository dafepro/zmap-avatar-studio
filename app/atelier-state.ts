import {
  defaultRecipe,
  validateRecipe,
  type Catalog,
  type Recipe,
} from "../src/core";
import {
  emptyWieldLoadout,
  validateWieldLoadout,
  type WieldCatalog,
  type WieldLoadout,
} from "../src/wield-core";

export type Look = {
  format: "shift-look";
  version: 1;
  name: string;
  appearance: Recipe;
  equipment: WieldLoadout;
};
export const STORAGE_KEY = "zmap:shift:looks:v1";
export const MAX_LOOKS = 12;
export const PALETTES = [
  {
    name: "Signal",
    primary: "#d5f04a",
    secondary: "#242938",
    trim: "#faf7ed",
    accent: "#ff7147",
  },
  {
    name: "Afterhours",
    primary: "#9e89e2",
    secondary: "#293347",
    trim: "#f5eeef",
    accent: "#d7f36b",
  },
  {
    name: "Heatwave",
    primary: "#f27c58",
    secondary: "#472f47",
    trim: "#fff0cf",
    accent: "#68d6c2",
  },
  {
    name: "Pacific",
    primary: "#61c8c2",
    secondary: "#243c47",
    trim: "#ffefd6",
    accent: "#f5b740",
  },
];
export function starterLook(
  catalog: Catalog,
  wield: WieldCatalog,
  variant = 0,
): Look {
  const appearance = defaultRecipe(catalog);
  const combinations = [
    {
      head: "head-spark",
      face: "face-volt",
      hair: "hair-volt",
      shirt: "shirt-track",
      bottom: "bottom-training",
      shoes: "shoes-high",
    },
    {
      head: "head-scout",
      face: "face-tide",
      hair: "hair-halo",
      shirt: "shirt-hoodie",
      bottom: "bottom-court",
      shoes: "shoes-runner",
    },
    {
      head: "head-spark",
      face: "face-ember",
      hair: "hair-nova",
      shirt: "shirt-ember",
      bottom: "bottom-training",
      shoes: "shoes-court",
    },
  ];
  Object.assign(appearance.parts, combinations[variant % combinations.length]);
  const capsuleTops = ["shirt-circuit", "shirt-relay"];
  if (variant < 2 && catalog.assets.some((a) => a.id === capsuleTops[variant]))
    appearance.parts.shirt = capsuleTops[variant];
  appearance.colors = {
    ...appearance.colors,
    primary: PALETTES[variant].primary,
    secondary: PALETTES[variant].secondary,
    trim: PALETTES[variant].trim,
    accent: PALETTES[variant].accent,
    skin: ["#bd815b", "#895b43", "#e5ad85"][variant],
    hair: ["#303040", "#2d2330", "#663847"][variant],
  };
  appearance.body = { weight: [0, 0.7, -0.65][variant] };
  return {
    format: "shift-look",
    version: 1,
    name: ["Signal runner", "Night shift", "Heat seeker"][variant],
    appearance,
    equipment: emptyWieldLoadout(wield),
  };
}
export function validateLook(
  input: unknown,
  catalog: Catalog,
  wield: WieldCatalog,
): asserts input is Look {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Choose a SHIFT look JSON file");
  const v = input as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        !["format", "version", "name", "appearance", "equipment"].includes(k),
    ) ||
    v.format !== "shift-look" ||
    v.version !== 1
  )
    throw new Error("This look format is not supported");
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 48)
    throw new Error("Look names must have 1–48 characters");
  validateRecipe(v.appearance, catalog);
  validateWieldLoadout(v.equipment, wield);
}
export function parseLook(
  text: string,
  catalog: Catalog,
  wield: WieldCatalog,
): Look {
  if (text.length > 32768)
    throw new Error("Look files must be smaller than 32 KB");
  const input: unknown = JSON.parse(text);
  validateLook(input, catalog, wield);
  return structuredClone(input);
}
export function readLooks(
  storage: Pick<Storage, "getItem">,
  catalog: Catalog,
  wield: WieldCatalog,
): Look[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  if (raw.length > 400000)
    throw new Error("Saved looks exceed the storage limit");
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input) || input.length > MAX_LOOKS)
    throw new Error("Saved looks are not valid");
  input.forEach((v) => validateLook(v, catalog, wield));
  return structuredClone(input);
}
export function saveLook(
  storage: Pick<Storage, "setItem">,
  saved: Look[],
  look: Look,
): Look[] {
  const next = [
    ...saved.filter((l) => l.name !== look.name),
    structuredClone(look),
  ];
  if (next.length > MAX_LOOKS)
    throw new Error(
      "Your shelf is full. Use an existing name to replace a look",
    );
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Keep the art-directed starter range while exposing additive capsule pieces. */
export function capsuleChoices(
  catalog: Catalog,
  slot: string,
  curated: readonly string[],
) {
  const allowed = new Set(curated);
  return catalog.assets
    .filter(
      (asset) =>
        asset.slot === slot &&
        (allowed.has(asset.id) || asset.tags?.includes("shift-capsule")),
    )
    .sort((a, b) => {
      const ai = curated.indexOf(a.id),
        bi = curated.indexOf(b.id);
      return (
        (ai < 0 ? curated.length : ai) - (bi < 0 ? curated.length : bi) ||
        a.id.localeCompare(b.id)
      );
    });
}
