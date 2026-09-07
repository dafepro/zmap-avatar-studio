import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

test("reference components, weight extremes and fitted accessories render with bounded geometry", async ({
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
  const result = await page.evaluate(
    async (url) => (await import(url)).renderReferenceStudy(),
    "/@fs" +
      fileURLToPath(new URL("../fixtures/reference-study.ts", import.meta.url)),
  );
  expect(errors).toEqual([]);
  expect(result.metadata).toHaveLength(12);
  for (const row of result.metadata)
    expect(row.sourceTriangles).toBeLessThanOrEqual(14000);
  await writeFile(
    "docs/evidence/reference-v2/browser-components.png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  await writeFile(
    "docs/evidence/reference-v2/browser-components.json",
    JSON.stringify(result.metadata, null, 2) + "\n",
  );
  const weights = await page.evaluate(
    async (url) => (await import(url)).renderReferenceStudy(true),
    "/@fs" +
      fileURLToPath(new URL("../fixtures/reference-study.ts", import.meta.url)),
  );
  expect(errors).toEqual([]);
  await writeFile(
    "docs/evidence/reference-v2/browser-weight-study.png",
    Buffer.from(weights.image.split(",")[1], "base64"),
  );
  await writeFile(
    "docs/evidence/reference-v2/browser-weight-study.json",
    JSON.stringify(weights.metadata, null, 2) + "\n",
  );
});

test("weight and component inspection work through the customization screen", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const height = await page.evaluate(
    () => (window as any).avatarStudio.catalog.rig.height,
  );
  await page.getByLabel("Body weight", { exact: true }).press("End");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.body?.weight),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Base mesh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Base mesh", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#capture-views")).toBeDisabled();
  await page.getByRole("button", { name: "Avatar", exact: true }).click();
  await page
    .getByRole("button", { name: "Try accessories", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.parts.headwear),
    )
    .toBe("hat-club-cap");
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.getByLabel("Body weight", { exact: true })).toHaveValue(
    "100",
  );
  expect(
    await page.evaluate(() => (window as any).avatarStudio.catalog.rig.height),
  ).toBe(height);
});

test("profile ink remains expressive without doubling frontal eyes in lit or illustrated views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const results = await page.evaluate(
    async (url) => (await import(url)).inspectExpressionProjection(),
    "/@fs" +
      fileURLToPath(
        new URL("../fixtures/expression-projection.ts", import.meta.url),
      ),
  );
  expect(errors).toEqual([]);
  for (const row of results) {
    if ((row.yaw === 0 || row.yaw === 45) && row.layer === "profile")
      expect(row.changed).toBe(0);
    if (row.yaw === 90 && row.layer === "front") expect(row.changed).toBe(0);
    if (
      (row.yaw === 0 && row.layer === "front") ||
      (row.yaw === 90 && row.layer === "profile")
    )
      expect(row.changed).toBeGreaterThan(100);
  }
});
