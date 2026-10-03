import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  parseLook,
  capsuleChoices,
  readLooks,
  saveLook,
  starterLook,
  validateLook,
  STORAGE_KEY,
} from "../app/atelier-state";
import { validateCatalog, type Catalog } from "../src/core";
import { validateWieldCatalog, type WieldCatalog } from "../src/wield-core";
const catalog: Catalog = JSON.parse(
  await readFile(
    new URL("../public/capsule/catalog.json", import.meta.url),
    "utf8",
  ),
);
const wield: WieldCatalog = JSON.parse(
  await readFile(
    new URL("../public/wield/catalog.json", import.meta.url),
    "utf8",
  ),
);
validateCatalog(catalog);
validateWieldCatalog(wield);
const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
};
test("each curated starting look validates with the isolated capsule catalog", () => {
  for (let i = 0; i < 3; i++)
    validateLook(starterLook(catalog, wield, i), catalog, wield);
});
test("save / reload preserves every independent choice including equipment and body", () => {
  const m = memory(),
    look = starterLook(catalog, wield);
  look.name = "Synthetic test look";
  look.appearance.parts.hair = "hair-halo";
  look.appearance.body = { weight: 0.75 };
  look.equipment.left = "wield-firefly-lantern";
  const saved = saveLook(m, [], look);
  assert.deepEqual(readLooks(m, catalog, wield), saved);
  assert.deepEqual(parseLook(JSON.stringify(look), catalog, wield), look);
  look.name = "changed externally";
  assert.equal(saved[0].name, "Synthetic test look");
});
test("replace by name does not duplicate shelf entries", () => {
  const m = memory(),
    look = starterLook(catalog, wield);
  let saved = saveLook(m, [], look);
  look.appearance.parts.hair = "hair-nova";
  saved = saveLook(m, saved, look);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].appearance.parts.hair, "hair-nova");
});
test("bad imports fail without mutating a previous look", () => {
  const before = starterLook(catalog, wield),
    original = JSON.stringify(before);
  for (const change of [
    (x: any) => (x.version = 2),
    (x: any) => (x.appearance.colors.primary = "red"),
    (x: any) => (x.appearance.parts.hair = "missing"),
    (x: any) => (x.equipment.right = "unknown"),
    (x: any) => (x.appearance.body.weight = NaN),
    (x: any) => (x.script = "bad"),
    (x: any) => (x.name = ""),
  ]) {
    const copy = structuredClone(before);
    change(copy);
    assert.throws(() => validateLook(copy, catalog, wield));
  }
  assert.equal(JSON.stringify(before), original);
  assert.throws(() => parseLook(" ".repeat(32769), catalog, wield));
  assert.throws(() => parseLook("{oops", catalog, wield));
});
test("storage failures remain visible and do not claim a saved look", () => {
  const m = {
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    },
    look = starterLook(catalog, wield),
    saved = [] as ReturnType<typeof starterLook>[];
  assert.throws(() => saveLook(m, saved, look), /Quota exceeded/);
  assert.equal(saved.length, 0);
});
test("invalid local storage fails explicitly; empty browser starts with empty shelf", () => {
  const m = memory();
  assert.deepEqual(readLooks(m, catalog, wield), []);
  m.setItem(STORAGE_KEY, "{broken");
  assert.throws(() => readLooks(m, catalog, wield));
  m.setItem(
    STORAGE_KEY,
    JSON.stringify(Array(13).fill(starterLook(catalog, wield))),
  );
  assert.throws(() => readLooks(m, catalog, wield));
});
test("saved shelf has bounded capacity and permits replacing an existing name", () => {
  const m = memory();
  let saved = [] as ReturnType<typeof starterLook>[];
  for (let i = 0; i < 12; i++) {
    const l = starterLook(catalog, wield);
    l.name = `Look ${i}`;
    saved = saveLook(m, saved, l);
  }
  assert.throws(() => saveLook(m, saved, starterLook(catalog, wield)), /full/);
  assert.equal(saveLook(m, saved, saved[0]).length, 12);
});

test("curated slot choices discover tagged capsule parts once without leaking other slots", () => {
  const extended = structuredClone(catalog);
  const face = extended.assets.find((a) => a.slot === "face")!;
  extended.assets.push({
    ...face,
    id: "face-new",
    tags: [...face.tags, "shift-capsule"],
  });
  extended.assets.push({ ...face, id: "face-hidden", tags: [] });
  const choices = capsuleChoices(extended, "face", [face.id, face.id]);
  assert.equal(choices[0].id, face.id);
  assert.equal(choices.filter((a) => a.id === face.id).length, 1);
  assert.ok(choices.some((a) => a.id === "face-new"));
  assert.ok(!choices.some((a) => a.id === "face-hidden"));
  assert.ok(choices.every((a) => a.slot === "face"));
});
