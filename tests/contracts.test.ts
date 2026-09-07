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
    total < 1500000,
    "whole illustrated kit stays under 1.5 MB; appearance budgets are checked separately",
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
  assert.equal(combinations, 31104);
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
