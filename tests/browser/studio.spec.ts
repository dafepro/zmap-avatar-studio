import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.waitForFunction(() => !!(window as any).avatarStudio);
}
test("all eight categories swap real assets; pose, colors, undo and named look survive reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  for (const [category, label] of [
    ["head", "Spark"],
    ["face", "Big grin"],
    ["hair", "High pony"],
    ["shirt", "Track jacket"],
    ["bottom", "Training shorts"],
    ["shoes", "High tops"],
    ["accessory", "Captain band"],
    ["effect", "Golden orbit"],
  ]) {
    await page.locator(`[data-category=${category}]`).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.locator("[data-category=shirt]").click();
  await page
    .getByRole("button", { name: "primary #496d65", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.colors.primary),
    )
    .toBe("#496d65");
  await page.getByRole("button", { name: "Undo change" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.colors.primary),
    )
    .toBe("#782e43");
  await page.getByRole("button", { name: "Redo change" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.colors.primary),
    )
    .toBe("#496d65");
  await page.getByRole("button", { name: "Wave", exact: true }).click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.locator("#save-look").click();
  await page.getByLabel("Name", { exact: true }).fill("My match-day look");
  await page.locator("#confirm-save").click();
  await expect(
    page.getByRole("button", { name: "My match-day look", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/studio-desktop.png",
    fullPage: true,
  });
  const before = await page.evaluate(() => (window as any).avatarStudio.recipe);
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await page.waitForFunction(() => !!(window as any).avatarStudio);
  expect(
    await page.evaluate(() => (window as any).avatarStudio.recipe),
  ).toEqual(before);
  expect(errors).toEqual([]);
});
test("import rejects unknown parts; valid export round trips and PNG contains a rendered portrait", async ({
  page,
}) => {
  await ready(page);
  const before = await page.evaluate(() => (window as any).avatarStudio.recipe);
  await page.locator("#file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...before, parts: { ...before.parts, head: "bad" } }),
    ),
  });
  await expect(page.locator("#status")).toHaveClass(/error/);
  expect(
    await page.evaluate(() => (window as any).avatarStudio.recipe),
  ).toEqual(before);
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("avatar-look.json");
  const { readFile } = await import("node:fs/promises");
  const saved = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(saved).toEqual(before);
  const image = page.waitForEvent("download");
  await page.locator("#photo").click();
  const png = await image;
  const bytes = await readFile((await png.path())!);
  expect(bytes.length).toBeGreaterThan(20000);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
});
test("failed part download retains the complete current look and a second selection retries", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/models/hair-pony.glb", (route) =>
    fail
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.continue(),
  );
  await ready(page);
  const before = await page.evaluate(() => (window as any).avatarStudio.recipe);
  await page.locator("[data-category=hair]").click();
  await page.getByRole("button", { name: "High pony", exact: true }).click();
  await expect(page.locator("#status")).toContainText("could not load");
  expect(
    await page.evaluate(() => (window as any).avatarStudio.recipe),
  ).toEqual(before);
  fail = false;
  await page.getByRole("button", { name: "High pony", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "High pony", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("portrait controls and reduced motion remain usable", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await ready(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.locator("#reduced")).toBeChecked();
  await page.locator("[data-category=hair]").click();
  await page.getByRole("button", { name: "Cloud curls", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cloud curls", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.screenshot({
    path: "docs/evidence/studio-portrait.png",
    fullPage: true,
  });
  await context.close();
});
test("40 full appearance replacements keep live GPU resources bounded", async ({
  page,
}) => {
  await ready(page);
  const samples = await page.evaluate(async () => {
    const app = (window as any).avatarStudio;
    const values = [];
    for (let i = 0; i < 40; i++) {
      const next = structuredClone(app.recipe);
      next.parts.head = i % 2 ? "head-scout" : "head-spark";
      await app.apply(next);
      await new Promise(requestAnimationFrame);
      values.push(app.stage.diagnostics());
    }
    return values;
  });
  expect(samples.at(-1).geometries).toBe(samples[1].geometries);
  expect(samples.at(-1).textures).toBe(samples[1].textures);
  expect(samples.at(-1).sourceTriangles).toBeLessThan(14000);
});
test("comic rendering survives swaps and mode changes without changing the recipe", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await ready(page);
  const initial = await page.evaluate(
    () => (window as any).avatarStudio.recipe,
  );
  await page.locator("#comic-style").click();
  expect(
    await page.evaluate(
      () => (window as any).avatarStudio.stage.camera.isOrthographicCamera,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.screenshot({
    path: "docs/evidence/studio-comic.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => (window as any).avatarStudio.recipe),
  ).toEqual(initial);
  for (let i = 0; i < 12; i++) {
    await page.locator("#soft-style").click();
    await page.locator("#comic-style").click();
    await page
      .getByRole("button", { name: i % 2 ? "Scout" : "Spark", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: i % 2 ? "Scout" : "Spark",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Walk", exact: true }).click();
  await page.waitForTimeout(200);
  expect(errors.filter((e) => /shader|GL_INVALID|WebGL/.test(e))).toEqual([]);
  await page.locator("#soft-style").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).avatarStudio.stage.diagnostics().geometries,
      ),
    )
    .toBeLessThan(40);
});
test("a new category selection retains an earlier pending choice", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/models/head-spark.glb", async (route) => {
    await gate;
    await route.continue();
  });
  await ready(page);
  await page.getByRole("button", { name: "Spark", exact: true }).click();
  await page.locator("[data-category=hair]").click();
  await page.getByRole("button", { name: "Cloud curls", exact: true }).click();
  release();
  await expect
    .poll(() => page.evaluate(() => (window as any).avatarStudio.recipe.parts))
    .toMatchObject({ head: "head-spark", hair: "hair-curls" });
});

test("blocked browser storage does not prevent editing or falsely report a saved look", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw Error("Storage unavailable");
    };
    Storage.prototype.setItem = () => {
      throw Error("Storage unavailable");
    };
  });
  await ready(page);
  await page.getByRole("button", { name: "Spark", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Spark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toContainText("could not save");
});
test("deleting the complete saved lineup does not recreate presets on reload", async ({
  page,
}) => {
  await ready(page);
  for (const name of ["Club captain", "Off duty", "Weekend energy"])
    await page
      .getByRole("button", { name: `Delete ${name}`, exact: true })
      .click();
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#presets button")).toHaveCount(0);
});
