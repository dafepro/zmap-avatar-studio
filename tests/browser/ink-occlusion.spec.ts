import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
test("ink survives scenery behind it, is hidden by scenery in front, and leaves no previous pose", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(
    async (url) => (await import(url)).inkOcclusion(),
    "/@fs" +
      fileURLToPath(new URL("../fixtures/ink-occlusion.ts", import.meta.url)),
  );
  expect(result.behind).toBeGreaterThan(100);
  expect(result.inFront).toBe(0);
  expect(result.stable).toBe(true);
});
