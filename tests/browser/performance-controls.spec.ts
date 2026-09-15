import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("one-hand workbench stows either selected item independently and restores both after an expression", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wield.html");
  await expect(page.locator("#use-left")).toBeEnabled();
  const selected = await page.evaluate(
    () => (window as any).wieldPlayground.wield.loadout,
  );
  await page.locator('[data-performance-hand="left"]').click();
  await expect(page.locator('[data-performance-hand="left"]')).toHaveText(
    "Draw left",
  );
  await expect(page.locator("#use-left")).toBeDisabled();
  await expect(page.locator("#use-right")).toBeEnabled();
  expect(
    await page.evaluate(() => (window as any).wieldPlayground.wield.loadout),
  ).toEqual(selected);
  await page.locator('[data-performance-hand="left"]').click();
  await expect(page.locator("#use-left")).toBeEnabled();
  await page.locator('[data-performance-emote="cheer"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).wieldPlayground.avatar.animationDiagnostics().emote
            ?.waiting,
      ),
    )
    .toBe(false);
  await expect(page.locator("#use-left")).toBeDisabled();
  await expect(page.locator("#use-right")).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).wieldPlayground.avatar.animationDiagnostics().emote
            ?.elapsed,
      ),
    )
    .toBeGreaterThan(0.4);
  await mkdir("docs/evidence/performances", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/performances/one-hand-cheer.png",
    fullPage: true,
  });
  await page.locator("[data-performance-stop]").click();
  await expect(page.locator("#use-left")).toBeEnabled();
  await expect(page.locator("#use-right")).toBeEnabled();
  expect(
    await page.evaluate(() => (window as any).wieldPlayground.wield.loadout),
  ).toEqual(selected);
  expect(errors).toEqual([]);
});

test("two-hand workbench retains the whole item and both grips through draw, dance and stow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/action.html");
  await expect(page.locator("#mechanism")).toBeEnabled();
  const selected = await page.evaluate(
    () => (window as any).fieldTools.wield.loadout,
  );
  await expect(page.locator('[data-performance-hand="left"]')).toBeHidden();
  await page.locator('[data-performance-hand="both"]').click();
  await expect(page.locator('[data-performance-hand="both"]')).toHaveText(
    "Draw tool",
  );
  await expect(page.locator("#mechanism")).toBeDisabled();
  expect(
    await page.evaluate(() => (window as any).fieldTools.wield.loadout),
  ).toEqual(selected);
  await page.locator('[data-performance-hand="both"]').click();
  await expect(page.locator("#mechanism")).toBeEnabled();
  await page.locator('[data-performance-emote="dance"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).fieldTools.avatar.animationDiagnostics().emote
            ?.waiting,
      ),
    )
    .toBe(false);
  await mkdir("docs/evidence/performances", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/performances/two-hand-dance.png",
    fullPage: true,
  });
  await page.locator("[data-performance-stop]").click();
  await expect(page.locator("#mechanism")).toBeEnabled();
  const result = await page.evaluate(() => {
    const app = (window as any).fieldTools;
    return {
      loadout: app.wield.loadout,
      sameObject:
        app.wield.getHand("left").object === app.wield.getHand("right").object,
      presentation: app.wield.diagnostics().presentation,
    };
  });
  expect(result.loadout).toEqual(selected);
  expect(result.sameObject).toBe(true);
  expect(result.presentation.left.phase).toBe("drawn");
  expect(result.presentation.right.phase).toBe("drawn");
  expect(errors).toEqual([]);
});

test("avatar studio exposes approved expression controls without changing the saved appearance", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-performance-emote="yes"]')).toBeEnabled();
  const recipe = await page.evaluate(
    () => (window as any).avatarStudio.stage.avatar.recipe,
  );
  await page.locator('[data-performance-emote="yes"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).avatarStudio.stage.avatar.animationDiagnostics().emote
            ?.id,
      ),
    )
    .toBe("yes");
  await page.locator("[data-performance-stop]").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).avatarStudio.stage.avatar.animationDiagnostics().emote
            ?.id ?? null,
      ),
    )
    .toBeNull();
  expect(
    await page.evaluate(() => (window as any).avatarStudio.stage.avatar.recipe),
  ).toEqual(recipe);
});
