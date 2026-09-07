import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

test("illustrated skin and ink deform together on the GPU and pigment stays stable", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const result = await page.evaluate(
    async (url) => {
      const module = await import(url);
      return module.renderIllustratedFixture();
    },
    `/@fs/${resolve("tests/fixtures/illustrated-render.ts")}`,
  );
  expect(
    errors.filter((error) => /shader|GL_INVALID|WebGL|error/i.test(error)),
  ).toEqual([]);
  expect(result.first).toBe(result.repeated);
  expect(result.bent).not.toBe(result.first);
  expect(result.calls).toBe(2);
  expect(result.inkPixels).toBeGreaterThan(100);
  expect(result.volumeContrast).toBeGreaterThan(12);
  await writeFile(
    testInfo.outputPath("illustrated-skinned-proof.png"),
    Buffer.from(result.image.split(",")[1], "base64"),
  );
});
