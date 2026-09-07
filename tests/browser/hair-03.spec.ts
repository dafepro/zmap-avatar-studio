import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { defaultRecipe, type Catalog } from "../../src/core";

test("hair quick choices retain a head change that is still loading", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/models/head-spark.glb", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  try {
    await page.getByRole("button", { name: "Spark", exact: true }).click();
    await page
      .getByRole("button", { name: "Nova · Hair 03", exact: true })
      .click();
  } finally {
    release();
  }
  await expect
    .poll(() => page.evaluate(() => (window as any).avatarStudio.recipe.parts))
    .toMatchObject({ head: "head-spark", hair: "hair-nova" });
});

test("new hair choices retain an approved saved look and combine with caps and glasses", async ({
  page,
}) => {
  const catalog: Catalog = await page.request
    .get("/catalog.json")
    .then((r) => r.json());
  const saved = defaultRecipe(catalog);
  saved.revision = "2.2.0";
  saved.parts.head = "head-spark";
  saved.parts.shirt = "shirt-hoodie";
  saved.parts.face = "face-wink";
  saved.parts.eyewear = "acc-glasses";
  saved.parts.headwear = "hat-club-cap";
  saved.body = { weight: 1 };
  saved.colors.skin = "#8f6048";
  await page.addInitScript((value) => {
    if (!localStorage.getItem("avatar-studio:current"))
      localStorage.setItem("avatar-studio:current", JSON.stringify(value));
  }, saved);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(
    page.getByText("The saved look could not be read.", { exact: false }),
  ).toHaveCount(0);
  for (const name of ["Nova", "Halo", "Reed"]) {
    await page
      .getByRole("button", { name: `${name} · Hair 03`, exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).avatarStudio.recipe.parts.hair),
      )
      .toBe(`hair-${name.toLowerCase()}`);
    const actual = await page.evaluate(() => ({
      recipe: (window as any).avatarStudio.recipe,
      triangles: (window as any).avatarStudio.stage.avatar.diagnostics()
        .sourceTriangles,
    }));
    expect(actual.recipe.parts).toEqual({
      ...saved.parts,
      hair: `hair-${name.toLowerCase()}`,
    });
    expect(actual.recipe.body).toEqual(saved.body);
    expect(actual.recipe.colors.skin).toBe(saved.colors.skin);
    expect(actual.triangles).toBeLessThanOrEqual(14000);
  }
  await page.reload();
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    await page.evaluate(() => (window as any).avatarStudio.recipe.parts.hair),
  ).toBe("hair-reed");
  const result = await page.evaluate(
    async (url) =>
      (await import(url)).renderFitQuality(
        true,
        ["hair-nova", "hair-halo", "hair-reed"],
        true,
      ),
    "/@fs" +
      fileURLToPath(new URL("../fixtures/fit-quality.ts", import.meta.url)),
  );
  expect(result.records.map((r: { id: string }) => r.id)).toEqual([
    "hair-nova",
    "hair-halo",
    "hair-reed",
  ]);
  for (const row of result.records) {
    expect(row.sourceTriangles).toBeLessThanOrEqual(14000);
    expect(row.headwear).toBe(true);
  }
  const base = "docs/evidence/hair-isolated/collection-03-accessories";
  await writeFile(
    base + ".png",
    Buffer.from(result.image.split(",")[1], "base64"),
  );
  await writeFile(
    base + ".json",
    JSON.stringify(result.records, null, 2) + "\n",
  );
  expect(errors).toEqual([]);
});

async function inspectionBounds(page: Page) {
  return page.evaluate(async () => {
    // Let the appearance-change or ResizeObserver event reach the renderer.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const stage = (window as any).avatarStudio.stage,
      root = stage.avatar.object.children[0],
      point = stage.camera.position.clone();
    root.updateWorldMatrix(true, true);
    stage.camera.updateMatrixWorld(true);
    let extent = 0,
      vertices = 0,
      depthClipped = 0;
    root.traverseVisible((object: any) => {
      if (!object.isMesh) return;
      if (object.isSkinnedMesh) object.skeleton.update();
      const positions = object.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        object
          .getVertexPosition(i, point)
          .applyMatrix4(object.matrixWorld)
          .project(stage.camera);
        extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
        if (point.z < -1 || point.z > 1) depthClipped++;
        vertices++;
      }
    });
    return { extent, vertices, depthClipped, targetY: stage.controls.target.y };
  });
}

test("hair inspection frames complete changing models across views, styles and portrait resize", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator('[data-inspect="hair"]').click();
  for (const style of ["comic", "soft"]) {
    await page.locator(`#${style}-style`).click();
    for (const name of ["Nova", "Halo", "Reed"]) {
      // Inspection remains active across every appearance replacement.
      await page
        .getByRole("button", { name: `${name} · Hair 03`, exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).avatarStudio.recipe.parts.hair),
        )
        .toBe(`hair-${name.toLowerCase()}`);
      for (const viewport of [
        { width: 1440, height: 1080 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const assertFramed = async () => {
          const bounds = await inspectionBounds(page);
          expect(bounds.vertices).toBeGreaterThan(1000);
          expect(bounds.targetY).toBeGreaterThan(1.6);
          expect(bounds.depthClipped).toBe(0);
          expect(bounds.extent).toBeLessThan(0.98);
        };
        await assertFramed();
        for (const view of ["front", "side", "back"]) {
          await page.locator(`[data-view="${view}"]`).click();
          await assertFramed();
          if (style === "comic" && name === "Nova" && view === "front")
            await page.locator("#stage").screenshot({
              path: `docs/evidence/hair-isolated/studio-hair-nova-${viewport.width === 390 ? "portrait" : "desktop"}.png`,
            });
        }
        // Exercise the top of the live orbit range as well as the view buttons.
        await page.evaluate(() => {
          const stage = (window as any).avatarStudio.stage,
            distance = stage.camera.position.distanceTo(stage.controls.target);
          stage.camera.position.copy(stage.controls.target);
          stage.camera.position.y += distance;
          stage.camera.position.z += 0.0001;
          stage.controls.update();
        });
        await assertFramed();
      }
    }
  }
});
