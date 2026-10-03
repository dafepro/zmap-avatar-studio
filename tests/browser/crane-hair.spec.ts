import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("Crane is independently selectable and exports actual WebGL hairstyle/accessory views", async ({
  page,
}) => {
  test.setTimeout(90000);
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
  await page.locator("[data-category=hair]").click();
  await page
    .getByRole("button", { name: "Crane undercut braid", exact: true })
    .click();
  await ready();
  const selected = await page.evaluate(
    () => (window as any).__atelier.look.appearance,
  );
  expect(selected.parts).toEqual({ ...before.parts, hair: "hair-crane" });
  expect(selected.body).toEqual(before.body);
  expect(selected.colors).toEqual(before.colors);
  await page.locator("#pause").click();
  await mkdir("docs/evidence/crane", { recursive: true });
  await page.screenshot({
    path: "docs/evidence/crane/browser-studio.png",
    fullPage: true,
  });
  for (const [label, glasses, cap] of [
    ["orbit", false, false],
    ["glasses", true, false],
    ["cap-glasses", true, true],
  ] as const) {
    const result = await page.evaluate(
      async ({ url, glasses, cap }) =>
        (await import(url)).renderCraneReview(glasses, ["hair-crane"], cap),
      {
        url:
          "/@fs" +
          fileURLToPath(
            new URL("../fixtures/crane-review.ts", import.meta.url),
          ),
        glasses,
        cap,
      },
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0].sourceTriangles).toBeLessThanOrEqual(14000);
    await writeFile(
      `docs/evidence/crane/browser-${label}.png`,
      Buffer.from(result.image.split(",")[1], "base64"),
    );
    await writeFile(
      `docs/evidence/crane/browser-${label}.json`,
      JSON.stringify(result.records, null, 2) + "\n",
    );
  }
  expect(errors).toEqual([]);
});
