import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
test("fitted accessory combinations render at front oblique profile and rear angles", async ({
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
    async (url) => (await import(url)).renderAccessoryStudy(),
    "/@fs" +
      fileURLToPath(new URL("../fixtures/accessory-study.ts", import.meta.url)),
  );
  expect(errors).toEqual([]);
  expect(result.metadata).toHaveLength(3);
  for (const row of result.metadata) {
    expect(
      row.assets.find((a: any) => a.id === row.recipe.parts.hair).url,
    ).toBe("models/" + row.recipe.parts.hair + ".glb");
  }
  await writeFile(
    "docs/evidence/accessory-study.png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  await writeFile(
    "docs/evidence/accessory-study.json",
    JSON.stringify(result.metadata, null, 2) + "\n",
  );
});

test("unseen oversized hair uses one source download through fitted front profile and rear renders", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const result = await page.evaluate(
    async (url) => (await import(url)).renderHairFittingStudy(),
    "/@fs" +
      fileURLToPath(
        new URL("../fixtures/hair-fitting-study.ts", import.meta.url),
      ),
  );
  expect(errors).toEqual([]);
  for (const row of result.metadata) expect(row.hairDownloads).toBe(1);
  await writeFile(
    "docs/evidence/hair-fitting-study.png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  await writeFile(
    "docs/evidence/hair-fitting-study.json",
    JSON.stringify(result.metadata, null, 2) + "\n",
  );
});

test("Try accessories preserves head hair and palette while equipping three independent slots", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const before = await page.evaluate(() => (window as any).avatarStudio.recipe);
  await page
    .getByRole("button", { name: "Try accessories", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.parts.headwear),
    )
    .toBe("hat-club-cap");
  const fitted = await page.evaluate(() => (window as any).avatarStudio.recipe);
  expect(fitted.parts).toEqual({
    ...before.parts,
    headwear: "hat-club-cap",
    eyewear: "acc-glasses",
    facialHair: "facial-mustache",
  });
  expect(fitted.colors).toEqual(before.colors);
  await page.getByRole("button", { name: "Side", exact: true }).click();
  await page.screenshot({
    path: "docs/evidence/studio-accessories.png",
    fullPage: true,
  });
  await page.locator("[data-category=headwear]").click();
  await page.locator('[data-part=""]').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.parts.headwear),
    )
    .toBe(null);
  const removed = await page.evaluate(
    () => (window as any).avatarStudio.recipe,
  );
  expect(removed.parts.eyewear).toBe("acc-glasses");
  expect(removed.parts.facialHair).toBe("facial-mustache");
  expect(removed.parts.hair).toBe(before.parts.hair);
});
