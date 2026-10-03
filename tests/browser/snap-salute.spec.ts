import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
test("Snap Salute actual runtime keyframes, builds and equipment control", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const result = await page.evaluate(
    async (url) => (await import(url)).renderSnapSaluteReview(),
    `/@fs/${resolve("tests/fixtures/snap-salute-review.ts")}`,
  );
  expect(result.samples).toHaveLength(8);
  expect(result.samples[2].emote.id).toBe("snap-salute");
  expect(result.samples[2].emote.weight).toBe(1);
  expect(result.samples[5].emote).toBeNull();
  await mkdir("docs/evidence/snap-salute", { recursive: true });
  await writeFile(
    "docs/evidence/snap-salute/browser-actual-sequence.png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  await writeFile(
    "docs/evidence/snap-salute/browser-report.json",
    JSON.stringify(result.samples, null, 2) + "\n",
  );
  await expect(
    page.locator('[data-performance-emote="snap-salute"]'),
  ).toBeEnabled();
  await page.locator('[data-performance-emote="snap-salute"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).avatarStudio.stage.avatar.animationDiagnostics().emote
            ?.id ?? null,
      ),
    )
    .toBe("snap-salute");
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
  expect(errors).toEqual([]);
});

test("SHIFT studio can preview Snap Salute after running and keeps mobile controls inside the stage", async ({
  page,
}) => {
  await page.goto("/atelier.html");
  await expect
    .poll(() =>
      page.evaluate(
        () => !!(window as any).__atelier && !(window as any).__atelier.busy,
      ),
    )
    .toBe(true);
  await page.locator('[data-pose="run"]').click();
  await page.getByRole("button", { name: "Play Snap salute" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__atelier.avatar.animationDiagnostics().emote?.id ??
          null,
      ),
    )
    .toBe("snap-salute");
  expect(await page.evaluate(() => (window as any).__atelier.stage.pose)).toBe(
    "idle",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__atelier.avatar.animationDiagnostics().emote
            ?.elapsed ?? 0,
      ),
    )
    .toBeGreaterThan(0.65);
  await mkdir("docs/evidence/snap-salute", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/snap-salute/browser-studio.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Play Snap salute" }),
  ).toBeInViewport();
});
