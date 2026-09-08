import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

const fixture =
  "/@fs" +
  fileURLToPath(new URL("../fixtures/action-study.ts", import.meta.url));
const evidence = "docs/evidence/action";
function errorsFrom(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /shader|WebGL|GL_INVALID/i.test(message.text())
    )
      errors.push(message.text());
  });
  return errors;
}
function fits(record: {
  positionError: number;
  basisError: number;
  proper: boolean;
  oneObject: boolean;
  distinctGrips: boolean;
  oneEffectGroup: boolean;
  relaxedHidden: boolean;
  actualVisible: number;
  heldTriangles: number;
  visibleTriangles: number;
  effectTriangles: number;
}) {
  expect(record.positionError).toBeLessThan(0.002);
  expect(record.basisError).toBeLessThan(0.00001);
  expect(record.proper).toBe(true);
  expect(record.oneObject).toBe(true);
  expect(record.distinctGrips).toBe(true);
  expect(record.oneEffectGroup).toBe(true);
  expect(record.relaxedHidden).toBe(true);
  expect(record.actualVisible).toBeLessThanOrEqual(16000);
  expect(record.heldTriangles).toBeLessThanOrEqual(2200);
  expect(record.visibleTriangles).toBeLessThanOrEqual(16000);
  expect(record.effectTriangles).toBeLessThanOrEqual(512);
}

test("three exported field devices retain both physical grip frames through weights, primary hands and four motions", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = errorsFrom(page);
  await page.goto("/");
  const result = await page.evaluate(
    async (url) => (await import(url)).renderActionStudy(),
    fixture,
  );
  expect(result.itemRecords).toHaveLength(12);
  expect(result.poseRecords).toHaveLength(72);
  expect(result.gripRecords).toHaveLength(12);
  expect(new Set(result.itemRecords.map((row: any) => row.id))).toEqual(
    new Set(["wield-tether-winch", "wield-rebound-panel", "wield-wake-driver"]),
  );
  for (const row of result.itemRecords)
    expect(row.triangles).toBeLessThanOrEqual(1200);
  for (const row of [...result.poseRecords, ...result.gripRecords]) fits(row);
  expect(result.errors).toEqual([]);
  expect(errors).toEqual([]);
  await mkdir(evidence, { recursive: true });
  for (const name of ["items", "assembled", "grips", "hero"] as const)
    await writeFile(
      `${evidence}/browser-${name}.png`,
      Buffer.from(result[name].split(",")[1], "base64"),
    );
  await writeFile(
    `${evidence}/browser-study.json`,
    JSON.stringify(
      {
        provenance: result.provenance,
        items: result.itemRecords,
        poses: result.poseRecords,
        grips: result.gripRecords,
      },
      null,
      2,
    ) + "\n",
  );
});

test("two-hand devices have one behavior owner, passive support input, reversible hand replacement and bounded lifetime", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = errorsFrom(page);
  await page.goto("/");
  const result = await page.evaluate(
    async (url) => (await import(url)).exerciseActionLifecycle(),
    fixture,
  );
  expect(result.ownership).toHaveLength(12);
  for (const row of result.ownership) {
    expect(row.oneCreate).toBe(true);
    expect(row.oneDispose).toBe(true);
    expect(row.resourcesDisposedOnce).toBe(true);
    expect(row.handSlotsEmpty).toBe(true);
    expect(row.relaxedRestored).toBe(true);
  }
  expect(result.mechanisms).toHaveLength(12);
  for (const row of result.mechanisms) {
    expect(
      row.supportPassive,
      `${row.id} support input must not activate the mechanism`,
    ).toBe(true);
    expect(
      row.active,
      `${row.id} primary input must move its authored mechanism`,
    ).toBe(true);
    expect(row.oncePerFrame).toBe(true);
    expect(row.reducedStable).toBe(true);
  }
  expect(result.appearance).toHaveLength(12);
  for (const row of result.appearance) {
    fits(row);
    expect(row.retained).toBe(true);
  }
  for (const row of result.lifecycle) expect(row).toEqual(result.baseline);
  expect(result.errors).toEqual([]);
  expect(errors).toEqual([]);
  await mkdir(evidence, { recursive: true });
  await writeFile(
    `${evidence}/browser-lifecycle.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
});
