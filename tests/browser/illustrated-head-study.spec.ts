import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

test("current head silhouette is captured at front exact-profile and three-quarter angles", async ({
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
    async (url) => (await import(url)).renderIllustratedHeadStudy(),
    "/@fs" +
      fileURLToPath(
        new URL("../fixtures/illustrated-head-study.ts", import.meta.url),
      ),
  );
  expect(errors).toEqual([]);
  expect(
    result.metadata.views.map((view: { degrees: number }) => view.degrees),
  ).toEqual([0, 90, 45]);
  expect(result.metadata.camera.pitch).toBe(0);
  const bytes = Buffer.from(result.image.split(",")[1], "base64");
  expect(bytes.length).toBeGreaterThan(100000);
  await writeFile("docs/evidence/illustrated-head-study.png", bytes);
  await writeFile(
    "docs/evidence/illustrated-head-study.json",
    JSON.stringify(result.metadata, null, 2) + "\n",
  );
});
