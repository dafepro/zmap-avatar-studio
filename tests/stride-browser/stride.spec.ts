import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

async function ready(page: Page) {
  await expect(page.locator("#change-status")).toHaveText(
    "All parts fitted. Ready to move.",
  );
  await expect(page.locator("#save-look")).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => (window as any).__atelier.busy))
    .toBe(false);
}
async function look(page: Page) {
  return page.evaluate(() => (window as any).__atelier.look);
}

test("Stride is a real independently selectable shoe, persists, and renders through three builds and running", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("docs/evidence/stride", { recursive: true });
  await page.goto("/atelier.html");
  await ready(page);
  const original = await look(page);
  await page.locator("[data-category=shoes]").click();
  const card = page.getByRole("button", {
    name: "Stride split-sole",
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.click();
  await ready(page);
  const equipped = await look(page);
  expect(equipped.appearance.parts.shoes).toBe("shoes-stride");
  for (const [slot, id] of Object.entries(original.appearance.parts))
    if (slot !== "shoes") expect(equipped.appearance.parts[slot]).toBe(id);
  await expect(card.locator("img")).toHaveClass(/loaded/);
  Object.assign(equipped.appearance.colors, {
    primary: "#df693b",
    secondary: "#32283f",
    trim: "#f2e4c5",
    accent: "#c6ea4c",
  });
  await page.locator("#look-file").setInputFiles({
    name: "stride.shift.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(equipped)),
  });
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "docs/evidence/stride/browser-stride-studio.png",
    fullPage: true,
  });
  const diagnostics: unknown[] = [];
  for (const weight of [-1, 0, 1]) {
    await page.locator("[data-category=body]").click();
    await page
      .getByLabel("Body build", { exact: true })
      .evaluate((element, value) => {
        const slider = element as HTMLInputElement;
        slider.value = String(value);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      }, weight);
    await ready(page);
    await expect
      .poll(async () => (await look(page)).appearance.body.weight)
      .toBe(weight);
    await page.locator("[data-view=hero]").click();
    await page
      .locator("#stage")
      .screenshot({ path: `docs/evidence/stride/browser-build-${weight}.png` });
    diagnostics.push(
      await page.evaluate(() => ({
        weight: (window as any).__atelier.look.appearance.body.weight,
        diagnostics: (window as any).__atelier.avatar.diagnostics(),
      })),
    );
  }
  await page.locator("[data-pose=run]").click();
  await expect(page.locator("[data-pose=run]")).toHaveClass("active");
  await page.waitForFunction(
    () =>
      (window as any).__atelier.avatar.animationDiagnostics().locomotion
        .clip !== "Rest",
  );
  await page.locator("[data-view=side]").click();
  await page
    .locator("#stage")
    .screenshot({ path: "docs/evidence/stride/browser-running-side.png" });
  await page.locator("[data-view=back]").click();
  await page
    .locator("#stage")
    .screenshot({ path: "docs/evidence/stride/browser-running-back.png" });
  await page.locator("#save-look").click();
  await page.getByLabel("Look name", { exact: true }).fill("Stride fit test");
  await page
    .locator("#save-form")
    .getByRole("button", { name: "Save look", exact: false })
    .click();
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  const saved = await look(page);
  await page.getByRole("button", { name: "Reset look", exact: true }).click();
  await ready(page);
  await page.reload();
  await ready(page);
  await page
    .getByRole("button", { name: "☆ Stride fit test", exact: true })
    .click();
  await ready(page);
  expect(await look(page)).toEqual(saved);
  // The original 1.0.0 look is still accepted and keeps every original part.
  await page.locator("#look-file").setInputFiles({
    name: "original.shift.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await ready(page);
  expect(await look(page)).toEqual(original);
  expect(errors).toEqual([]);
  await writeFile(
    "docs/evidence/stride/browser-validation.json",
    JSON.stringify(
      {
        source:
          "Actual Chromium WebGL screenshots of the equipped exported GLB",
        diagnostics,
        errors,
        savedLookRoundtrip: true,
        originalRecipePreserved: true,
      },
      null,
      2,
    ) + "\n",
  );
});
