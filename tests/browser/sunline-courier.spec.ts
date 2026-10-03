import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("Sunline pieces select independently; complete look imports and renders all directions/run/wave in shipping ComicStyle", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/atelier.html");
  const ready = () =>
    expect(page.locator("#change-status")).toHaveText(
      "All parts fitted. Ready to move.",
    );
  await ready();
  const before = await page.evaluate(
    () => (window as any).__atelier.look.appearance,
  );
  for (const [category, id, label] of [
    ["headwear", "hat-sunline-visor", "Sunline open visor"],
    ["shirt", "shirt-sunline-courier", "Sunline stepped jacket"],
    ["bottom", "bottom-sunline-cargo", "Sunline tapered cargo"],
    ["shoes", "shoes-sunline-track", "Sunline split track trainers"],
    ["accessory", "acc-sunline-envelope", "Sunline envelope pack"],
  ]) {
    const previous = await page.evaluate(
      () => (window as any).__atelier.look.appearance,
    );
    if (["headwear", "accessory"].includes(category)) {
      await page.locator("[data-category=extras]").click();
      await page
        .getByRole("button", {
          name: category === "headwear" ? "Hats" : "Accessories",
          exact: true,
        })
        .click();
    } else await page.locator(`[data-category=${category}]`).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await ready();
    const selected = await page.evaluate(
      () => (window as any).__atelier.look.appearance,
    );
    expect(selected.parts).toEqual({ ...previous.parts, [category]: id });
    expect(selected.body).toEqual(previous.body);
    expect(selected.colors).toEqual(previous.colors);
  }
  const lookPath = fileURLToPath(
    new URL(
      "../../public/capsule/looks/sunline-courier.shift.json",
      import.meta.url,
    ),
  );
  await page.locator("#look-file").setInputFiles(lookPath);
  await ready();
  const imported = JSON.parse(await readFile(lookPath, "utf8"));
  await expect
    .poll(() => page.evaluate(() => (window as any).__atelier.look.appearance))
    .toEqual(imported.appearance);
  expect(before.parts).not.toEqual(imported.appearance.parts);
  await page.locator("#pause").click();
  await mkdir("docs/evidence/sunline-courier", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/sunline-courier/browser-studio.png",
    fullPage: true,
  });
  const result = await page.evaluate(
    async (url) => (await import(url)).renderSunlineReview(),
    "/@fs" +
      fileURLToPath(new URL("../fixtures/sunline-review.ts", import.meta.url)),
  );
  expect(result.records).toHaveLength(20);
  for (const record of result.records) {
    expect(record.sourceTriangles).toBeLessThanOrEqual(14000);
    expect(record.parts).toBe(record.optional ? 12 : 9);
  }
  await writeFile(
    "docs/evidence/sunline-courier/browser-collection.png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  await writeFile(
    "docs/evidence/sunline-courier/browser-collection.json",
    JSON.stringify(result.records, null, 2) + "\n",
  );
  expect(errors).toEqual([]);
});
