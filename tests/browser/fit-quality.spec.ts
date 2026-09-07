import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
test("all hair styles render through a complete head orbit with and without glasses", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  for (const accessories of [false, true]) {
    const result = await page.evaluate(
      async ({ url, accessories }) =>
        (await import(url)).renderFitQuality(accessories),
      {
        url:
          "/@fs" +
          fileURLToPath(new URL("../fixtures/fit-quality.ts", import.meta.url)),
        accessories,
      },
    );
    for (const r of result.records)
      expect(r.sourceTriangles).toBeLessThanOrEqual(14000);
    const path = `docs/evidence/fit-quality/${accessories ? "glasses" : "scalps"}-orbit`;
    await writeFile(
      path + ".png",
      Buffer.from(result.image.split(",")[1], "base64"),
    );
    await writeFile(
      path + ".json",
      JSON.stringify(result.records, null, 2) + "\n",
    );
  }
  expect(errors).toEqual([]);
});
