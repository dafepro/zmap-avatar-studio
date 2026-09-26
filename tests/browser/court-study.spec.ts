import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

test("court collection presets, fitted turnarounds and moving cloth", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  for (const name of ["Courtside", "Matchday"]) {
    await page
      .getByRole("button", { name: `${name} · Court collection`, exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).avatarStudio.recipe.parts.shirt),
      )
      .toBe(`shirt-${name.toLowerCase()}`);
  }
  await mkdir("docs/evidence/court-collection", { recursive: true });
  for (const motion of [false, true]) {
    const result = await page.evaluate(
      async ({ url, motion }) => (await import(url)).renderCourtStudy(motion),
      {
        url:
          "/@fs/" +
          fileURLToPath(
            new URL("../fixtures/court-study.ts", import.meta.url),
          ).replaceAll("\\", "/"),
        motion,
      },
    );
    expect(result.metadata).toHaveLength(10);
    for (const row of result.metadata)
      expect(row.sourceTriangles).toBeLessThanOrEqual(14000);
    const base = `docs/evidence/court-collection/${motion ? "motion" : "turnaround"}`;
    await writeFile(
      base + ".png",
      Buffer.from(result.image.split(",")[1], "base64"),
    );
    await writeFile(
      base + ".json",
      JSON.stringify(result.metadata, null, 2) + "\n",
    );
  }
  expect(errors).toEqual([]);
});
