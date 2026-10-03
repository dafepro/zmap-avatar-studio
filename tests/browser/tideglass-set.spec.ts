import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
test("Tideglass five-piece look imports, each component remains independent, and ComicStyle renders both heads and every weight", async ({
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
  const manifestURL = new URL(
    "../../public/capsule/sets/tideglass-explorer.json",
    import.meta.url,
  );
  const manifest = JSON.parse(await readFile(manifestURL, "utf8"));
  const file = fileURLToPath(new URL(manifest.look, manifestURL));
  const look = JSON.parse(await readFile(file, "utf8"));
  await page.locator("#look-file").setInputFiles(file);
  await ready();
  expect(await page.evaluate(() => (window as any).__atelier.look)).toEqual(
    look,
  );
  const components = manifest.components;
  for (const c of components) {
    const before = structuredClone(look);
    const legacy: { [key: string]: string | null } = {
      headwear: null,
      shirt: "shirt-jersey",
      bottom: "bottom-court",
      shoes: "shoes-court",
      accessory: null,
    };
    before.appearance.parts[c.slot] = legacy[c.slot];
    await page.locator("#look-file").setInputFiles({
      name: "mixed.shift.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(before)),
    });
    await ready();
    expect(await page.evaluate(() => (window as any).__atelier.look)).toEqual(
      before,
    );
  }
  await page.locator("#look-file").setInputFiles(file);
  await ready();
  await page.locator("#pause").click();
  await mkdir("docs/evidence/tideglass", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/tideglass/browser-studio.png",
    fullPage: true,
  });
  for (const optional of [false, true]) {
    const result = await page.evaluate(
      async ({ url, optional }) =>
        (await import(url)).renderTideglassReview(optional),
      {
        url:
          "/@fs" +
          fileURLToPath(
            new URL("../fixtures/tideglass-review.ts", import.meta.url),
          ),
        optional,
      },
    );
    expect(result.records).toHaveLength(30);
    for (const record of result.records) {
      expect(record.sourceTriangles).toBeLessThanOrEqual(14000);
      expect(record.parts).toBe(optional ? 12 : 9);
    }
    await writeFile(
      `docs/evidence/tideglass/browser-${optional ? "optional-stack" : "complete-set"}.png`,
      Buffer.from(result.image.split(",")[1], "base64"),
    );
    await writeFile(
      `docs/evidence/tideglass/browser-${optional ? "optional-stack" : "complete-set"}.json`,
      JSON.stringify(result.records, null, 2) + "\n",
    );
  }
  expect(errors).toEqual([]);
});
