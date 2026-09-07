import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { defaultRecipe, type Catalog, type Recipe } from "../../src/core";

const fixture =
  "/@fs" +
  fileURLToPath(new URL("../fixtures/novelty-study.ts", import.meta.url));
const evidence = "docs/evidence/novelty";
const novelty = {
  headwear: "hat-quack-captain",
  eyewear: "acc-starstruck",
  effect: "effect-pocket-galaxy",
};

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /shader|WebGL|GL_INVALID/i.test(message.text())
    )
      errors.push(message.text());
  });
  return errors;
}

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.waitForFunction(() => !!(window as any).avatarStudio);
}

async function recipeOf(page: Page): Promise<Recipe> {
  return page.evaluate(() => (window as any).avatarStudio.recipe);
}

async function snapshot(page: Page, id: string) {
  return page.evaluate(
    async ({ url, id }) => {
      const module = await import(url);
      return module.partSnapshot(
        (window as any).avatarStudio.stage.avatar.object,
        id,
      );
    },
    { url: fixture, id },
  );
}

async function assertParts(page: Page, parts: Recipe["parts"]) {
  await expect.poll(async () => (await recipeOf(page)).parts).toEqual(parts);
  expect(
    await page.evaluate(
      () =>
        (window as any).avatarStudio.stage.avatar.diagnostics().sourceTriangles,
    ),
  ).toBeLessThanOrEqual(14000);
  await expect(page.locator("#status")).not.toHaveClass(/error/);
}

test("novelty choices retain saved customization, fixed pigments and reversible hair fitting", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = watchErrors(page),
    catalog: Catalog = await page.request
      .get("/catalog.json")
      .then((response) => response.json()),
    saved = defaultRecipe(catalog);
  saved.revision = "2.3.0";
  Object.assign(saved.parts, {
    head: "head-spark",
    hair: "hair-nova",
    face: "face-wink",
    shirt: "shirt-tide",
    shoes: "shoes-high",
    accessory: "acc-band",
    headwear: null,
    eyewear: null,
    effect: null,
  });
  saved.body = { weight: -0.55 };
  Object.assign(saved.colors, {
    skin: "#9e6542",
    hair: "#aa6031",
    primary: "#28847f",
    secondary: "#263b3c",
    trim: "#f4ead7",
    accent: "#d9a342",
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("avatar-studio:current"))
      localStorage.setItem("avatar-studio:current", JSON.stringify(value));
    if (!localStorage.getItem("avatar-studio:looks"))
      localStorage.setItem(
        "avatar-studio:looks",
        JSON.stringify([{ name: "Before the silliness", recipe: value }]),
      );
  }, saved);
  await ready(page);
  expect(await recipeOf(page)).toEqual(saved);
  await expect(
    page.getByRole("button", { name: "Before the silliness", exact: true }),
  ).toBeVisible();
  const originalHair = await snapshot(page, saved.parts.hair!);
  expect(originalHair.meshes).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Go silly", exact: true }).click();
  const assembledParts = { ...saved.parts, ...novelty };
  await assertParts(page, assembledParts);
  expect(await recipeOf(page)).toEqual({ ...saved, parts: assembledParts });
  const fixedBefore = await Promise.all(
    Object.values(novelty).map((id) => snapshot(page, id)),
  );
  for (const part of fixedBefore) {
    expect(part.meshes).toBeGreaterThan(0);
    expect(part.materials.length).toBeGreaterThan(0);
  }
  // Change every exposed palette family on this saved look through the UI.
  // The accessories must keep their original gold, teal and planet pigments.
  for (const [category, channel, color] of [
    ["head", "skin", "#593c30"],
    ["shirt", "primary", "#496d65"],
    ["shirt", "secondary", "#47597c"],
    ["shirt", "trim", "#263b3c"],
    ["hair", "hair", "#ddd1b9"],
    ["accessory", "accent", "#782e43"],
  ]) {
    await page.locator(`[data-category="${category}"]`).click();
    await page
      .getByRole("button", { name: `${channel} ${color}`, exact: true })
      .click();
    await expect
      .poll(async () => (await recipeOf(page)).colors[channel])
      .toBe(color);
  }
  const fixedAfter = await Promise.all(
    Object.values(novelty).map((id) => snapshot(page, id)),
  );
  expect(fixedAfter.map((part) => part.materials)).toEqual(
    fixedBefore.map((part) => part.materials),
  );
  // Removing only the hat restores all hair vertices, even with the specs on.
  // This catches accidental glasses-driven hair carving in the browser path.
  const remaining: Recipe["parts"] = { ...assembledParts, headwear: null };
  await page.locator('[data-category="headwear"]').click();
  await page.locator('#parts [data-part=""]').click();
  await assertParts(page, remaining);
  expect((await snapshot(page, saved.parts.hair!)).geometryHash).toBe(
    originalHair.geometryHash,
  );
  for (const slot of ["eyewear", "effect"] as const) {
    remaining[slot] = null;
    await page.locator(`[data-category="${slot}"]`).click();
    await page.locator('#parts [data-part=""]').click();
    await assertParts(page, remaining);
  }
  const recolored = await recipeOf(page);
  const choices = [
    ["Quack Captain", "headwear"],
    ["Starstruck Specs", "eyewear"],
    ["Pocket Galaxy", "effect"],
  ] as const;
  for (const [label, slot] of choices) {
    await page
      .locator("#collection-presets")
      .getByRole("button", { name: label, exact: true })
      .click();
    remaining[slot] = novelty[slot];
    await assertParts(page, remaining);
    expect(await recipeOf(page)).toEqual({
      ...recolored,
      parts: { ...remaining },
    });
  }
  await page.locator("#save-look").click();
  await page.getByLabel("Name", { exact: true }).fill("Playful matchday");
  await page.locator("#confirm-save").click();
  const final = await recipeOf(page);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).avatarStudio);
  expect(await recipeOf(page)).toEqual(final);
  await expect(
    page.getByRole("button", { name: "Playful matchday", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Before the silliness", exact: true })
    .click();
  await assertParts(page, saved.parts);
  expect(await recipeOf(page)).toEqual(saved);
  expect(errors).toEqual([]);
});

test("Go silly retains a pending head and frames the complete avatar in both styles and viewport shapes", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = watchErrors(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/models/head-spark.glb", async (route) => {
    await gate;
    await route.continue();
  });
  await ready(page);
  const previous = await recipeOf(page);
  try {
    await page.getByRole("button", { name: "Spark", exact: true }).click();
    await page.getByRole("button", { name: "Go silly", exact: true }).click();
    expect((await recipeOf(page)).parts.head).toBe(previous.parts.head);
  } finally {
    release();
  }
  await assertParts(page, {
    ...previous.parts,
    ...novelty,
    head: "head-spark",
  });
  expect(await recipeOf(page)).toEqual({
    ...previous,
    parts: { ...previous.parts, ...novelty, head: "head-spark" },
  });
  await page.getByRole("button", { name: "Stand", exact: true }).click();
  await page.locator("#reduced").check();
  await mkdir(evidence, { recursive: true });
  for (const style of ["comic", "soft"]) {
    await page.locator(`#${style}-style`).click();
    for (const viewport of [
      { width: 1440, height: 1080 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const view of ["front", "side", "back"]) {
        await page.locator(`[data-view="${view}"]`).click();
        const bounds = await page.evaluate(async (url) => {
          const module = await import(url);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          const stage = (window as any).avatarStudio.stage;
          return module.projectedBounds(stage.avatar.object, stage.camera);
        }, fixture);
        expect(bounds.vertices).toBeGreaterThan(5000);
        expect(bounds.nonFinite).toBe(0);
        expect(bounds.depthClipped).toBe(0);
        expect(
          bounds.extent,
          `${style} / ${viewport.width}px / ${view}`,
        ).toBeLessThan(0.98);
        if (style === "comic" && view === "front")
          await page.locator("#stage").screenshot({
            path: `${evidence}/studio-full-${viewport.width === 390 ? "portrait" : "desktop"}.png`,
          });
      }
    }
  }
  expect(errors).toEqual([]);
});

test("all catalog hair silhouettes and three complete novelty looks render as browser evidence", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = watchErrors(page);
  await ready(page);
  const expectedHair = await page.evaluate(() =>
    (window as any).avatarStudio.catalog.assets
      .filter((asset: any) => asset.slot === "hair")
      .map((asset: any) => asset.id),
  );
  const result = await page.evaluate(
    async (url) => (await import(url)).renderNoveltyStudy(),
    fixture,
  );
  expect(result.orbits.map((row: any) => row.hair)).toEqual(expectedHair);
  expect(
    new Set(result.orbits.map((row: any) => row.recipe.parts.head)),
  ).toEqual(new Set(["head-scout", "head-spark"]));
  expect(
    new Set(result.orbits.map((row: any) => row.recipe.body.weight)),
  ).toEqual(new Set([-1, 1]));
  for (const row of result.orbits) {
    expect(row.sourceTriangles).toBeLessThanOrEqual(14000);
    expect(row.recipe.parts).toMatchObject(novelty);
    expect(row.views.map((view: any) => view.degrees)).toEqual([
      0, 45, 90, 135, 180, 225, 270, 315,
    ]);
    for (const view of row.views) {
      expect(view.extent).toBeLessThan(0.98);
      expect(view.depthClipped).toBe(0);
      expect(view.nonFinite).toBe(0);
      expect(view.paintedPixels).toBeGreaterThan(1000);
    }
  }
  expect(result.lineup.map((row: any) => row.id)).toEqual([
    "nova",
    "halo",
    "reed",
  ]);
  for (const row of result.lineup) {
    expect(row.sourceTriangles).toBeLessThanOrEqual(14000);
    expect(row.recipe.parts).toMatchObject(novelty);
    for (const bounds of [row.fullBounds, row.effectBounds]) {
      expect(bounds.extent).toBeLessThan(0.98);
      expect(bounds.nonFinite).toBe(0);
      expect(bounds.depthClipped).toBe(0);
    }
    expect(row.paintedPixels).toBeGreaterThan(1000);
    expect(row.detailPixels).toBeGreaterThan(1000);
  }
  await mkdir(evidence, { recursive: true });
  await writeFile(
    `${evidence}/browser-orbits.png`,
    Buffer.from(result.orbitImage.split(",")[1], "base64"),
  );
  await writeFile(
    `${evidence}/browser-lineup.png`,
    Buffer.from(result.lineupImage.split(",")[1], "base64"),
  );
  await writeFile(
    `${evidence}/browser-orbits.json`,
    JSON.stringify(
      {
        provenance: result.provenance,
        orbits: result.orbits,
        lineup: result.lineup,
      },
      null,
      2,
    ) + "\n",
  );
  expect(errors).toEqual([]);
});
