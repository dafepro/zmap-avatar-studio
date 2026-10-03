import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("Moonwake components select independently, full look imports, and actual WebGL captures both heads/builds in five views", async ({
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
  const manifest = JSON.parse(
    await readFile("public/capsule/sets/moonwake-festival.json", "utf8"),
  );
  for (const part of manifest.components) {
    const before = await page.evaluate(
      () => (window as any).__atelier.look.appearance,
    );
    if (["headwear", "accessory"].includes(part.slot)) {
      await page.locator("[data-category=extras]").click();
      await page
        .getByRole("button", {
          name: part.slot === "headwear" ? "Hats" : "Accessories",
          exact: true,
        })
        .click();
    } else await page.locator(`[data-category=${part.slot}]`).click();
    await page.locator(`[data-part=${part.id}]`).click();
    await ready();
    const selected = await page.evaluate(
      () => (window as any).__atelier.look.appearance,
    );
    expect(selected.parts).toEqual({ ...before.parts, [part.slot]: part.id });
    expect(selected.body).toEqual(before.body);
    expect(selected.colors).toEqual(before.colors);
  }
  await page
    .locator("#look-file")
    .setInputFiles("public/capsule/looks/moonwake-festival.shift.json");
  // The file input handler awaits File.text() before starting the appearance
  // transaction. Don't mistake the previous look's ready status for its import.
  await expect
    .poll(() => page.evaluate(() => (window as any).__atelier.look.name))
    .toBe("Moonwake Festival");
  await ready();
  const expected = JSON.parse(
    await readFile("public/capsule/looks/moonwake-festival.shift.json", "utf8"),
  );
  expect(await page.evaluate(() => (window as any).__atelier.look)).toEqual(
    expected,
  );
  await page.locator("#pause").click();
  await mkdir("docs/evidence/moonwake", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/moonwake/browser-studio.png",
    fullPage: true,
  });
  const result = await page.evaluate(
    async (url) => (await import(url)).renderMoonwakeReview(),
    "/@fs" +
      fileURLToPath(new URL("../fixtures/moonwake-review.ts", import.meta.url)),
  );
  expect(result.records).toHaveLength(30);
  for (const r of result.records)
    expect(r.sourceTriangles).toBeLessThanOrEqual(14000);
  await writeFile(
    "docs/evidence/moonwake/browser-poses.png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  await writeFile(
    "docs/evidence/moonwake/browser-poses.json",
    JSON.stringify(result.records, null, 2) + "\n",
  );
  expect(errors).toEqual([]);
});
