import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const moduleUrl =
  "/@fs" + fileURLToPath(new URL("../../src/directional.ts", import.meta.url));

test("captured color matches each material's live tone mapping and survives source bitmap disposal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /shader|GL_INVALID|WebGL|bitmap/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  const result = await page.evaluate(
    async (url) => (await import(url)).verifyDirectionalColors(),
    "/@fs" +
      fileURLToPath(
        new URL("../fixtures/directional-colors.ts", import.meta.url),
      ),
  );
  for (const patch of result.colors) {
    expect(patch.live[3]).toBe(255);
    for (let channel = 0; channel < 4; channel++)
      expect(
        Math.abs(patch.live[channel] - patch.baked[channel]),
      ).toBeLessThanOrEqual(2);
  }
  expect(result.colors[0].live).not.toEqual(result.colors[1].live);
  expect(result.closedAt).toBe(1);
  expect(result.imageClosed).toBe(true);
  for (const color of result.bitmapColors) {
    expect(color[3]).toBe(255);
    for (let channel = 0; channel < 3; channel++)
      expect(
        Math.abs(color[channel] - [83, 139, 118][channel]),
      ).toBeLessThanOrEqual(2);
  }
  expect(errors).toEqual([]);
});

test("sixteen illustrated views contain transparent silhouettes and previews share one bounded texture", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /shader|GL_INVALID|WebGL|framebuffer/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.waitForFunction(() => !!(window as any).avatarStudio);
  const result = await page.evaluate(async (url) => {
    const { bakeDirectionalAtlas } = await import(url);
    const stage = (window as any).avatarStudio.stage;
    stage.setReduced(true);
    stage.turn(false);
    stage.setPose("idle");
    stage.setComic(true);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const recipe = JSON.stringify((window as any).avatarStudio.recipe);
    const before = stage.diagnostics();
    const samples = [];
    const tiles = [];
    let drawCalls = 0;
    let separateDirections = false;
    for (let cycle = 0; cycle < 4; cycle++) {
      const atlas = await bakeDirectionalAtlas(
        stage.renderer,
        stage.avatar.object,
        {
          tileSize: 64,
          lights: stage.scene.children.filter((object: any) => object.isLight),
        },
      );
      if (cycle === 0) {
        const pixels = atlas.readPixels();
        const width = atlas.metadata.width;
        for (const frame of atlas.metadata.frames) {
          let visible = 0,
            transparent = 0,
            signature = 0;
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              const offset =
                ((width - frame.rect.y - 64 + y) * width + frame.rect.x + x) *
                4;
              if (pixels[offset + 3] > 10) visible++;
              else transparent++;
              signature =
                (signature +
                  pixels[offset] * (x + 1) +
                  pixels[offset + 1] * (y + 1)) %
                1000000007;
            }
          tiles.push({ visible, transparent, signature });
        }
        const first = atlas.createPreview(),
          second = atlas.createPreview();
        first.setAzimuth(0);
        second.setAzimuth(Math.PI);
        separateDirections =
          first.frameIndex === 0 &&
          second.frameIndex === 8 &&
          first.object.material.uniforms.atlas.value ===
            second.object.material.uniforms.atlas.value;
        const scene = stage.scene.clone(false);
        scene.add(first.object);
        first.faceCamera(stage.camera);
        stage.renderer.render(scene, stage.camera);
        drawCalls = stage.renderer.info.render.calls;
        first.dispose();
        second.dispose();
      }
      atlas.dispose();
      stage.renderer.render(stage.scene, stage.camera);
      samples.push(stage.diagnostics());
    }
    const abort = new AbortController();
    let cancellation = "";
    try {
      await bakeDirectionalAtlas(stage.renderer, stage.avatar.object, {
        tileSize: 64,
        signal: abort.signal,
        onProgress: (done: number) => {
          if (done === 2) abort.abort();
        },
      });
    } catch (error) {
      cancellation = (error as Error).name;
    }
    stage.renderer.render(stage.scene, stage.camera);
    return {
      tiles,
      drawCalls,
      separateDirections,
      before,
      samples,
      afterCancel: stage.diagnostics(),
      cancellation,
      recipeUnchanged:
        recipe === JSON.stringify((window as any).avatarStudio.recipe),
    };
  }, moduleUrl);
  expect(result.tiles).toHaveLength(16);
  for (const tile of result.tiles) {
    expect(tile.visible).toBeGreaterThan(150);
    expect(tile.transparent).toBeGreaterThan(500);
  }
  expect(
    new Set(result.tiles.map((tile) => tile.signature)).size,
  ).toBeGreaterThan(12);
  expect(result.drawCalls).toBe(1);
  expect(result.separateDirections).toBe(true);
  expect(result.recipeUnchanged).toBe(true);
  expect(result.cancellation).toBe("AbortError");
  expect(result.samples.at(-1).geometries).toBe(result.samples[0].geometries);
  expect(result.samples.at(-1).textures).toBe(result.samples[0].textures);
  expect(result.afterCancel.geometries).toBe(result.samples.at(-1).geometries);
  expect(result.afterCancel.textures).toBe(result.samples.at(-1).textures);
  expect(errors).toEqual([]);
});

test("studio captures, exports and returns to live editing without retaining an obsolete projection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  const original = await page.evaluate(() => {
    const app = (window as any).avatarStudio;
    return { recipe: app.recipe, pitch: app.stage.controls.getPolarAngle() };
  });
  await page.locator("#capture-views").click();
  await expect(page.locator("#export-views")).toBeVisible();
  await expect(page.locator("#projection-note")).toContainText("Frozen pose");
  expect(
    await page.evaluate(
      () => (window as any).avatarStudio.stage.avatar.object.visible,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Side", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).avatarStudio.stage.projection.frameIndex,
      ),
    )
    .toBe(4);
  const downloads: import("@playwright/test").Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await page.locator("#export-views").click();
  await expect.poll(() => downloads.length).toBe(2);
  const png = downloads.find((download) =>
    download.suggestedFilename().endsWith(".png"),
  )!;
  const json = downloads.find((download) =>
    download.suggestedFilename().endsWith(".json"),
  )!;
  const bytes = await readFile((await png.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(2048);
  expect(bytes.readUInt32BE(20)).toBe(2048);
  const metadata = JSON.parse(await readFile((await json.path())!, "utf8"));
  expect(metadata.frames).toHaveLength(16);
  expect(metadata.renderStyle).toBe("illustrated");
  expect(metadata.pose.gesture).toBe("idle");
  expect(metadata.recipe).toEqual(original.recipe);
  await page.screenshot({
    path: "docs/evidence/studio-directional.png",
    fullPage: true,
  });
  await page.locator("#live-view").click();
  await expect(page.locator("#capture-views")).toBeVisible();
  const live = await page.evaluate(() => {
    const app = (window as any).avatarStudio;
    return {
      visible: app.stage.avatar.object.visible,
      pitch: app.stage.controls.getPolarAngle(),
    };
  });
  expect(live.visible).toBe(true);
  expect(live.pitch).toBeCloseTo(original.pitch, 2);
  await page.locator("#capture-views").click();
  await expect(page.locator("#export-views")).toBeVisible();
  await page.getByRole("button", { name: "Spark", exact: true }).click();
  await expect(page.locator("#capture-views")).toBeVisible();
  await expect(page.locator("#export-views")).toBeHidden();
  expect(
    await page.evaluate(
      () => (window as any).avatarStudio.stage.avatar.object.visible,
    ),
  ).toBe(true);
});

test("a drawing capture can be cancelled without publishing a partial view or reporting an error", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await page.evaluate(() => {
    const schedule = window.setTimeout;
    window.setTimeout = ((
      handler: TimerHandler,
      delay?: number,
      ...args: any[]
    ) =>
      schedule(
        handler,
        delay === 0 ? 80 : delay,
        ...args,
      )) as typeof window.setTimeout;
  });
  await page.locator("#capture-views").click();
  await page
    .getByRole("button", { name: "Cancel capture", exact: true })
    .click();
  await expect(page.locator("#capture-views")).toBeVisible();
  await expect(page.locator("#capture-views")).toBeEnabled();
  await expect(page.locator("#export-views")).toBeHidden();
  await expect(page.locator("#status")).not.toHaveClass(/error/);
  expect(
    await page.evaluate(
      () => (window as any).avatarStudio.stage.avatar.object.visible,
    ),
  ).toBe(true);
});
