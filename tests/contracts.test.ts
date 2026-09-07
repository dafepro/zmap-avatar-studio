import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  validateCatalog,
  validateRecipe,
  defaultRecipe,
  parseRecipe,
  inspectGlb,
  selectedAssets,
  type Catalog,
  type Recipe,
} from "../src/core";
import { AvatarLibrary } from "../src/runtime";
import "./helpers/node-image";
const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const fetcher: typeof fetch = async (input) => {
  const url = new URL(String(input));
  const bytes = await readFile(
    new URL("../public" + url.pathname, import.meta.url),
  );
  return new Response(bytes);
};
test("all catalog assets match their hashes, budgets and self-contained attachment contracts", async () => {
  validateCatalog(catalog);
  let total = 0;
  for (const asset of catalog.assets) {
    const bytes = await readFile(
      new URL("../public/" + asset.url, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
    );
    inspectGlb(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      asset,
    );
    total += bytes.length;
  }
  assert.ok(
    total < 2100000,
    `${catalog.assets.length}-part illustrated kit stays under 2.1 MB; appearance budgets are checked separately`,
  );
});
test("every supported combination fits the common rig and resource budgets", () => {
  const recipe = defaultRecipe(catalog);
  let combinations = 0;
  const visit = (i: number) => {
    if (i === catalog.slots.length) {
      validateRecipe(recipe, catalog);
      combinations++;
      return;
    }
    const slot = catalog.slots[i];
    const ids: (string | null)[] = catalog.assets
      .filter((a) => a.slot === slot.id)
      .map((a) => a.id);
    if (!slot.required) ids.push(null);
    for (const id of ids) {
      recipe.parts[slot.id] = id;
      visit(i + 1);
    }
  };
  visit(0);
  const expectedCombinations = catalog.slots.reduce(
    (total, slot) =>
      total *
      (catalog.assets.filter((asset) => asset.slot === slot.id).length +
        (slot.required ? 0 : 1)),
    1,
  );
  assert.ok(expectedCombinations > 0);
  assert.equal(combinations, expectedCombinations);
});
test("recipes reject unknown parts, URLs, wrong slots, extra fields, rig drift and unbounded colors", () => {
  const base = defaultRecipe(catalog);
  for (const modify of [
    (r: any) => (r.parts.head = "http://evil.test/asset"),
    (r: any) => (r.parts.head = "shoes-court"),
    (r: any) => (r.parts.head = null),
    (r: any) => (r.rig = "other-rig"),
    (r: any) => (r.revision = "999.0.0"),
    (r: any) => (r.colors.skin = "url(payload)"),
    (r: any) => (r.script = "alert(1)"),
    (r: any) => (r.parts.unknown = "head-scout"),
  ]) {
    const r = structuredClone(base);
    modify(r);
    assert.throws(() => parseRecipe(JSON.stringify(r), catalog));
  }
  assert.throws(() => parseRecipe(" ".repeat(16001), catalog));
});
test("explicit catalog compatibility preserves an approved saved recipe without rewriting it", async () => {
  const current: Catalog = {
    ...structuredClone(catalog),
    revision: "2.3.0",
    compatibleRecipeRevisions: ["2.2.0"],
  };
  validateCatalog(current);
  const saved = defaultRecipe(current);
  saved.revision = "2.2.0";
  saved.parts.hair = "hair-sweep";
  saved.colors.hair = "#75442c";
  const loaded = parseRecipe(JSON.stringify(saved), current);
  assert.deepEqual(loaded, saved);
  assert.notEqual(loaded, saved);
  assert.equal(defaultRecipe(current).revision, "2.3.0");
  assert.ok(
    selectedAssets(loaded, current).some((asset) => asset.id === "hair-sweep"),
  );
  const library = new AvatarLibrary(current, "https://assets.test/", fetcher);
  const avatar = library.create();
  try {
    await avatar.setAppearance(loaded);
    assert.deepEqual(avatar.recipe, saved);
    assert.ok(avatar.diagnostics().triangles > 0);
  } finally {
    avatar.dispose();
    library.dispose();
  }
});
test("recipe compatibility is explicit and never grants undeclared or future revisions", () => {
  const current: Catalog = {
    ...structuredClone(catalog),
    revision: "2.3.0",
    compatibleRecipeRevisions: ["2.2.0"],
  };
  for (const revision of [
    "2.1.0",
    "2.2.1",
    "2.3.1",
    "3.0.0",
    "2.2",
    "02.2.0",
  ]) {
    const recipe = { ...defaultRecipe(current), revision };
    assert.throws(() => parseRecipe(JSON.stringify(recipe), current), {
      code: "version",
    });
  }
  delete current.compatibleRecipeRevisions;
  const undeclared = { ...defaultRecipe(current), revision: "2.2.0" };
  assert.throws(() => validateRecipe(undeclared, current), { code: "version" });
});
test("approved earlier recipes retain identity, part, schema and resource validation", () => {
  const current: Catalog = {
    ...structuredClone(catalog),
    revision: "2.3.0",
    compatibleRecipeRevisions: ["2.2.0"],
  };
  const saved = { ...defaultRecipe(current), revision: "2.2.0" };
  for (const [code, modify] of [
    ["part", (r: any) => (r.parts.hair = "hair-missing")],
    ["part", (r: any) => (r.parts.hair = "head-scout")],
    ["version", (r: any) => (r.catalog = "unrelated-catalog")],
    ["version", (r: any) => (r.rig = "unrelated-rig")],
    ["version", (r: any) => (r.version = 2)],
    ["schema", (r: any) => (r.script = "payload")],
    ["schema", (r: any) => (r.parts.unknown = "hair-sweep")],
    ["color", (r: any) => (r.colors.hair = "url(payload)")],
  ] as const) {
    const invalid = structuredClone(saved);
    modify(invalid);
    assert.throws(() => parseRecipe(JSON.stringify(invalid), current), {
      code,
    });
  }
  for (const budget of ["maxTriangles", "maxBytes", "maxParts"] as const) {
    const bounded = structuredClone(current);
    bounded.budgets[budget] = 1;
    validateCatalog(bounded);
    assert.throws(() => validateRecipe(saved, bounded), { code: "budget" });
  }
});
test("catalogs reject malformed, duplicate, current and future compatibility revisions", () => {
  const current: Catalog = { ...structuredClone(catalog), revision: "2.3.0" };
  for (const compatibleRecipeRevisions of [
    null,
    "2.2.0",
    {},
    [2],
    ["2.2"],
    ["02.2.0"],
    ["2.2.0-beta.1"],
    ["2.2.0", "2.2.0"],
    ["2.3.0"],
    ["2.3.1"],
    ["3.0.0"],
    Array.from({ length: 17 }, (_, i) => `1.0.${i}`),
  ])
    assert.throws(
      () => validateCatalog({ ...current, compatibleRecipeRevisions }),
      { code: "catalog" },
    );
  validateCatalog({ ...current, compatibleRecipeRevisions: [] });
  validateCatalog({
    ...current,
    compatibleRecipeRevisions: Array.from({ length: 16 }, (_, i) => `1.0.${i}`),
  });
  validateCatalog({
    ...current,
    revision: "2.10.0",
    compatibleRecipeRevisions: ["2.9.10"],
  });
  assert.throws(
    () =>
      validateCatalog({
        ...current,
        revision: "2.9.0",
        compatibleRecipeRevisions: ["2.10.0"],
      }),
    { code: "catalog" },
  );
});
test("new catalog slots and parts use the same public recipe contract without a core branch", () => {
  const c = structuredClone(catalog);
  c.slots.push({ id: "wrist", label: "Wristwear", required: false });
  const part = {
    ...c.assets.find((a) => a.slot === "accessory")!,
    id: "wrist-demo",
    slot: "wrist",
  };
  c.assets.push(part);
  validateCatalog(c);
  const r = defaultRecipe(c);
  r.parts.wrist = "wrist-demo";
  validateRecipe(r, c);
  part.excludesTags = ["sport"];
  c.assets.find((a) => a.id === r.parts.shirt)!.tags = ["sport"];
  assert.throws(() => validateRecipe(r, c), /cannot be worn/);
});
test("atomic replacement keeps the prior avatar on failure and ignores stale completed requests", async () => {
  let release!: () => void;
  let failing = false;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async (input, init) => {
      const path = String(input);
      if (path.includes("head-spark")) await gate;
      if (failing && path.includes("acc-glasses"))
        return new Response("missing", { status: 503 });
      return fetcher(input, init);
    },
  );
  const avatar = library.create();
  const base = defaultRecipe(catalog);
  await avatar.setAppearance(base);
  const first = avatar.object.children[0];
  failing = true;
  await assert.rejects(
    avatar.setAppearance({
      ...base,
      parts: { ...base.parts, eyewear: "acc-glasses" },
    }),
    /could not load/,
  );
  assert.equal(avatar.object.children[0], first);
  assert.deepEqual(avatar.recipe, base);
  const slow = avatar.setAppearance({
    ...base,
    parts: { ...base.parts, head: "head-spark" },
  });
  const latest = { ...base, parts: { ...base.parts, face: "face-grin" } };
  await avatar.setAppearance(latest);
  release();
  assert.equal(await slow, false);
  assert.deepEqual(avatar.recipe, latest);
  assert.equal(avatar.object.children.length, 1);
  avatar.dispose();
  library.dispose();
  assert.equal(avatar.object.children.length, 0);
});
test("instances own independent resources and disposal while loading cannot resurrect an avatar", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  const a = library.create(),
    b = library.create();
  const r = defaultRecipe(catalog);
  await Promise.all([a.setAppearance(r), b.setAppearance(r)]);
  let ga: unknown, gb: unknown;
  a.object.traverse((o: any) => {
    if (o.geometry) ga ??= o.geometry;
  });
  b.object.traverse((o: any) => {
    if (o.geometry) gb ??= o.geometry;
  });
  assert.notEqual(ga, gb);
  a.dispose();
  assert.ok(b.diagnostics().triangles > 1000);
  b.dispose();
  const c = library.create();
  const pending = c.setAppearance(r);
  c.dispose();
  assert.equal(await pending, false);
  assert.equal(c.object.children.length, 0);
  library.dispose();
});
test("asset integrity failures fail before mesh parsing and can retry cleanly", async () => {
  let corrupt = true;
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async (input, init) => {
      const response = await fetcher(input, init);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (corrupt) bytes[bytes.length - 1] ^= 1;
      return new Response(bytes);
    },
  );
  const avatar = library.create();
  await assert.rejects(
    avatar.setAppearance(defaultRecipe(catalog)),
    /approved asset/,
  );
  assert.equal(avatar.object.children.length, 0);
  corrupt = false;
  await avatar.setAppearance(defaultRecipe(catalog));
  assert.ok(avatar.recipe);
  avatar.dispose();
  library.dispose();
});

test("prepared factories produce complete independent characters and reject after library disposal", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  const recipe = defaultRecipe(catalog);
  const create = await library.prepare(recipe);
  recipe.parts.head = "head-spark";
  const a = create(),
    b = create();
  assert.equal(a.recipe?.parts.head, "head-scout");
  assert.notEqual(a.object.children[0], b.object.children[0]);
  const character = a.asCharacter(() => true);
  character.update({ vx: 2, vz: 0, gesture: 1 }, 1);
  assert.equal(a.object.getObjectByName("head")!.rotation.z, 0);
  a.dispose();
  assert.ok(b.diagnostics().triangles > 1000);
  b.dispose();
  library.dispose();
  assert.throws(create, /disposed/);
});
test("catalog rejects an empty required slot before deriving a default recipe", () => {
  const empty = structuredClone(catalog);
  empty.assets = empty.assets.filter((a) => a.slot !== "head");
  assert.throws(() => validateCatalog(empty), /Required slot/);
});
