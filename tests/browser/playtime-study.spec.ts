import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

test("playtime items are independent and fit together in actual browser renders", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  for (const [label, slot, id] of [
    ["Frog Days", "headwear", "hat-frog-days"],
    ["Bolt Mode", "eyewear", "acc-bolt-mode"],
    ["Melon Club", "shirt", "shirt-melon-club"],
  ]) {
    await page
      .getByRole("button", { name: `${label} · Playtime`, exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          (slot) => (window as any).avatarStudio.recipe.parts[slot],
          slot,
        ),
      )
      .toBe(id);
  }
  await page.getByRole("button", { name: "Go playtime", exact: true }).click();
  await mkdir("docs/evidence/playtime", { recursive: true });
  for (const motion of [false, true]) {
    const result = await page.evaluate(
      async ({ url, motion }) =>
        (await import(url)).renderPlaytimeStudy(motion),
      {
        url:
          "/@fs/" +
          fileURLToPath(
            new URL("../fixtures/playtime-study.ts", import.meta.url),
          ).replaceAll("\\", "/"),
        motion,
      },
    );
    expect(result.metadata).toHaveLength(15);
    for (const row of result.metadata)
      expect(row.sourceTriangles).toBeLessThanOrEqual(14000);
    const base = `docs/evidence/playtime/${motion ? "sprint" : "turnaround"}`;
    await writeFile(
      base + ".png",
      Buffer.from(result.image.split(",")[1], "base64"),
    );
    await writeFile(
      base + ".json",
      JSON.stringify(result.metadata, null, 2) + "\n",
    );
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: "docs/evidence/playtime/studio-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
