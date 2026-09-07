import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

test("current modular outfits produce an actual illustrated front-side-wave evidence panel", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /shader|WebGL|GL_INVALID/i.test(message.text())
    )
      errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const result = await page.evaluate(
    async (url) => (await import(url)).renderIllustratedLineup(),
    "/@fs" +
      fileURLToPath(
        new URL("../fixtures/illustrated-lineup.ts", import.meta.url),
      ),
  );
  expect(errors).toEqual([]);
  expect(result.evidence).toHaveLength(3);
  for (const look of result.evidence)
    expect(look.triangles).toBeGreaterThan(1000);
  const bytes = Buffer.from(result.image.split(",")[1], "base64");
  expect(bytes.length).toBeGreaterThan(100000);
  await writeFile("docs/evidence/illustrated-lineup.png", bytes);
  await writeFile(
    "docs/evidence/illustrated-lineup.json",
    JSON.stringify(result.evidence, null, 2) + "\n",
  );
});
