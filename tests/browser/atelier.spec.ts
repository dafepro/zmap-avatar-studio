import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await expect(page.locator("#change-status")).toHaveText(
    "All parts fitted. Ready to move.",
  );
  await expect(page.locator("#save-look")).toBeEnabled();
}
async function current(page: Page) {
  return page.evaluate(() => (window as any).__atelier.look);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/atelier.html");
  await ready(page);
});
test("real capsule pieces, hair, build, clothing and footwear swap independently", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".thumb img.loaded").first()).toBeVisible();
  await page.getByRole("button", { name: "Relay vest", exact: true }).click();
  await ready(page);
  expect((await current(page)).appearance.parts.shirt).toBe("shirt-relay");
  await page.locator("[data-category=hair]").click();
  await page.getByRole("button", { name: "Halo curls", exact: true }).click();
  await ready(page);
  expect((await current(page)).appearance.parts.hair).toBe("hair-halo");
  expect((await current(page)).appearance.parts.shirt).toBe("shirt-relay");
  await page.locator("[data-category=body]").click();
  await page.getByLabel("Body build", { exact: true }).fill("0.75");
  await page.getByLabel("Body build", { exact: true }).press("Tab");
  await ready(page);
  expect((await current(page)).appearance.body.weight).toBe(0.75);
  await page.getByRole("button", { name: "Skin tone 5", exact: true }).click();
  await ready(page);
  expect((await current(page)).appearance.colors.skin).toBe("#754b36");
  await page.locator("[data-category=shoes]").click();
  await page.getByRole("button", { name: "Pace runners", exact: true }).click();
  await ready(page);
  expect((await current(page)).appearance.parts.shoes).toBe("shoes-runner");
  await page
    .getByRole("button", { name: "Afterhours palette", exact: true })
    .click();
  await ready(page);
  expect((await current(page)).appearance.colors.primary).toBe("#9e89e2");
  expect(errors).toEqual([]);
});
test("save, reset, reload and load preserve appearance and both gear slots", async ({
  page,
}) => {
  await page.locator("[data-category=gear]").click();
  await page
    .getByLabel("Left hand", { exact: true })
    .selectOption("wield-firefly-lantern");
  await ready(page);
  await page
    .getByLabel("Right hand", { exact: true })
    .selectOption("wield-bubble-comet");
  await ready(page);
  await page.locator("#save-look").click();
  await page.getByLabel("Look name", { exact: true }).fill("Synthetic remix");
  await page
    .locator("#save-form")
    .getByRole("button", { name: "Save look", exact: false })
    .click();
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  const saved = await current(page);
  await page.getByRole("button", { name: "Reset look", exact: true }).click();
  await ready(page);
  expect((await current(page)).equipment.left).toBeNull();
  await page.reload();
  await ready(page);
  await page
    .getByRole("button", { name: "☆ Synthetic remix", exact: true })
    .click();
  await ready(page);
  expect(await current(page)).toEqual(saved);
});
test("rapid swaps commit latest intent; undo restores the prior look", async ({
  page,
}) => {
  await page.locator("[data-category=hair]").click();
  await page.getByRole("button", { name: "Halo curls", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova ponytail", exact: true })
    .click();
  await page.getByRole("button", { name: "Reed waves", exact: true }).click();
  await ready(page);
  expect((await current(page)).appearance.parts.hair).toBe("hair-reed");
  await page
    .getByRole("button", { name: "Undo last change", exact: true })
    .click();
  await ready(page);
  expect((await current(page)).appearance.parts.hair).toBe("hair-nova");
});
test("dialog cancel/Escape and invalid import leave the committed avatar intact", async ({
  page,
}) => {
  const before = await current(page);
  await page.locator("#save-look").click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  await page.locator("#save-look").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  await page.locator("#look-file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"shift-look","version":999}'),
  });
  await expect(page.locator("#toast")).toContainText("Import stopped");
  expect(await current(page)).toEqual(before);
});
test("JSON export imports without losing equipment or changing the avatar", async ({
  page,
}) => {
  await page.locator("[data-category=gear]").click();
  await page
    .getByLabel("Left hand", { exact: true })
    .selectOption("wield-firefly-lantern");
  await page
    .getByLabel("Right hand", { exact: true })
    .selectOption("wield-bubble-comet");
  await ready(page);
  const before = await current(page),
    download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: false }).click();
  const file = await (await download).path();
  expect(file).toBeTruthy();
  await page.getByRole("button", { name: "Reset look", exact: true }).click();
  await ready(page);
  expect(await current(page)).not.toEqual(before);
  await page.locator("#look-file").setInputFiles(file!);
  await ready(page);
  expect(await current(page)).toEqual(before);
});
test("mobile has no horizontal overflow; pose and camera controls stay accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#stage canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.locator("[data-view=back]").click();
  await expect(page.locator("[data-view=back]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("[data-pose=run]").click();
  await expect(page.locator("[data-pose=run]")).toHaveClass("active");
  await page.locator("#pause").click();
  await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-category=hair]").click();
  await expect(
    page.getByRole("button", { name: "Volt crop", exact: true }),
  ).toBeVisible();
});
test("an asset failure restores the previous complete look and offers retry", async ({
  page,
}) => {
  const before = await current(page);
  await page.locator("[data-category=hair]").click();
  // Thumbnails may already have cached an asset. New contexts exercise an uncached asset via an imported recipe.
  await page.route("**/capsule/models/facial-mustache.glb", (route) =>
    route.abort(),
  );
  const bad = structuredClone(before);
  bad.appearance.parts.facialHair = "facial-mustache";
  await page.locator("#look-file").setInputFiles({
    name: "test.shift.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.locator("#change-status")).toContainText(
    "Previous look restored",
  );
  expect(await current(page)).toEqual(before);
  await page.unroute("**/capsule/models/facial-mustache.glb");
  await page.locator("#look-file").setInputFiles({
    name: "test.shift.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await ready(page);
  expect((await current(page)).appearance.parts.facialHair).toBe(
    "facial-mustache",
  );
});

test("capture actual desktop, mixed gear and mobile studio evidence", async ({
  page,
}) => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir("docs/evidence/atelier", { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".thumb img.loaded")).toHaveCount(
    await page.locator(".part-card[data-part]:not([data-part=none])").count(),
  );
  await page.locator("#pause").click();
  await page.screenshot({
    path: "docs/evidence/atelier/01-circuit-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Night shift/ }).click();
  await ready(page);
  await page.locator("[data-category=gear]").click();
  await page
    .getByLabel("Left hand", { exact: true })
    .selectOption("wield-firefly-lantern");
  await ready(page);
  await page
    .getByLabel("Right hand", { exact: true })
    .selectOption("wield-bubble-comet");
  await ready(page);
  await page.screenshot({
    path: "docs/evidence/atelier/02-relay-dual-gear.png",
    fullPage: true,
  });
  await page.locator("[data-category=extras]").click();
  await page.getByRole("button", { name: "Accessories", exact: true }).click();
  await page
    .getByRole("button", { name: "Pulse sling pack", exact: true })
    .click();
  await ready(page);
  await page.locator("[data-view=back]").click();
  await page.screenshot({
    path: "docs/evidence/atelier/03-pulse-pack-back.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Reset look", exact: true }).click();
  await ready(page);
  await page.locator("[data-view=hero]").click();
  await page.locator("[data-category=hair]").click();
  await expect(page.locator(".thumb img.loaded")).toHaveCount(
    await page.locator(".part-card[data-part]:not([data-part=none])").count(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/evidence/atelier/04-mobile-studio.png",
    fullPage: true,
  });
});

test("one settled slider change creates exactly one Undo step", async ({
  page,
}) => {
  const before = await current(page);
  await page.locator("[data-category=body]").click();
  await page.locator("#body-build").evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = "0.65";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect
    .poll(async () => (await current(page)).appearance.body?.weight)
    .toBe(0.65);
  await page.locator("#body-build").dispatchEvent("change");
  await page
    .getByRole("button", { name: "Undo last change", exact: true })
    .click();
  await ready(page);
  expect(await current(page)).toEqual(before);
});
