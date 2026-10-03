import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("Kiln pieces swap independently and its portable look renders actual complete WebGL evidence", async ({
  page,
}) => {
  test.setTimeout(120000);
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
  const set = JSON.parse(
    await readFile(
      new URL("../../public/capsule/sets/kiln-workshop.json", import.meta.url),
      "utf8",
    ),
  );
  for (const c of set.components) {
    const before = await page.evaluate(
      () => (window as any).__atelier.look.appearance,
    );
    await page.locator(`[data-category=${c.slot}]`).click();
    await page.getByRole("button", { name: c.label, exact: true }).click();
    await ready();
    const after = await page.evaluate(
      () => (window as any).__atelier.look.appearance,
    );
    expect(after.parts).toEqual({ ...before.parts, [c.slot]: c.id });
    expect(after.body).toEqual(before.body);
    expect(after.colors).toEqual(before.colors);
  }
  await page
    .locator("#look-file")
    .setInputFiles(
      fileURLToPath(
        new URL(
          "../../public/capsule/looks/kiln-workshop.shift.json",
          import.meta.url,
        ),
      ),
    );
  await ready();
  const recipe = await page.evaluate(
    () => (window as any).__atelier.look.appearance,
  );
  for (const c of set.components) expect(recipe.parts[c.slot]).toBe(c.id);
  await page.locator("#pause").click();
  await mkdir("docs/evidence/kiln", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/kiln/browser-studio.png",
    fullPage: true,
  });
  for (const head of ["head-scout", "head-spark"])
    for (const weight of [-1, 0, 1]) {
      const result = await page.evaluate(
        async ({ url, head, weight }) =>
          (await import(url)).renderKilnReview(head, weight),
        {
          url:
            "/@fs" +
            fileURLToPath(
              new URL("../fixtures/kiln-review.ts", import.meta.url),
            ),
          head,
          weight,
        },
      );
      expect(result.records).toHaveLength(5);
      for (const r of result.records) {
        expect(r.sourceTriangles).toBeLessThanOrEqual(14000);
        expect(r.parts).toBe(9);
      }
      const name = `browser-${head}-${weight}`;
      await writeFile(
        `docs/evidence/kiln/${name}.png`,
        Buffer.from(result.image.split(",")[1], "base64"),
      );
      await writeFile(
        `docs/evidence/kiln/${name}.json`,
        JSON.stringify(result.records, null, 2) + "\n",
      );
    }
  expect(errors).toEqual([]);
});
