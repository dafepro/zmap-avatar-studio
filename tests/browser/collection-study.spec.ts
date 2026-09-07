import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
test("collection presets and front, side, top, size and accessory renders", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  for (const name of ["Ember", "Tide", "Volt"]) {
    await page
      .getByRole("button", { name: `${name} · Collection 02`, exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).avatarStudio.recipe.parts.hair),
      )
      .toBe(`hair-${name.toLowerCase()}`);
  }
  for (const necks of [false, true]) {
    const result = await page.evaluate(
      async ({ url, necks }) =>
        (await import(url)).renderCollectionStudy(necks),
      {
        url:
          "/@fs" +
          fileURLToPath(
            new URL("../fixtures/collection-study.ts", import.meta.url),
          ),
        necks,
      },
    );
    expect(result.metadata).toHaveLength(12);
    for (const row of result.metadata)
      expect(row.sourceTriangles).toBeLessThanOrEqual(14000);
    const base = `docs/evidence/collection-02/runtime-${necks ? "necks" : "orthographic"}`;
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
