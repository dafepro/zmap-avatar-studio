import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("Challenger shows asymmetric fitted front/profile ink on both heads in lit and illustrated WebGL", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|GL_INVALID|GLSL/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/");
  const report = await page.evaluate(
    async (url) => (await import(url)).renderChallengerReview(),
    "/@fs" +
      fileURLToPath(
        new URL("../fixtures/challenger-review.ts", import.meta.url),
      ),
  );
  expect(errors).toEqual([]);
  for (const row of report.projection) {
    if (Math.abs(row.yaw) <= 45 && row.layer === "profile")
      expect(row.changed).toBe(0);
    if (Math.abs(row.yaw) === 90 && row.layer === "front")
      expect(row.changed).toBe(0);
    if (
      (row.yaw === 0 && row.layer === "front") ||
      (Math.abs(row.yaw) === 90 && row.layer === "profile")
    )
      expect(row.changed).toBeGreaterThan(100);
  }
  await mkdir("docs/evidence/challenger", { recursive: true });
  for (const [key, file] of [
    ["headSheet", "browser-heads.png"],
    ["action", "browser-action.png"],
  ] as const)
    await writeFile(
      "docs/evidence/challenger/" + file,
      Buffer.from(report[key].split(",")[1], "base64"),
    );
  await writeFile(
    "docs/evidence/challenger/browser-report.json",
    JSON.stringify(
      { projection: report.projection, assemblies: report.assemblies },
      null,
      2,
    ) + "\n",
  );
});
