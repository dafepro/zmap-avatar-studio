import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

const fixture =
  "/@fs" +
  fileURLToPath(new URL("../fixtures/wield-study.ts", import.meta.url));
const evidence = "docs/evidence/wield";
async function activeParticles(
  page: Page,
  name: "avatarStudio" | "wieldPlayground",
  only?: "left" | "right",
) {
  return page.evaluate(
    ({ name, only }) => {
      const app = (window as any)[name];
      let total = 0;
      for (const hand of only ? [only] : ["left", "right"])
        app.wield.getHand(hand)?.effects.traverseVisible((node: any) => {
          if (node.isInstancedMesh) total += node.count;
        });
      return total;
    },
    { name, only },
  );
}

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
async function expectRelaxedHandsHidden(page: Page) {
  expect(
    await page.evaluate(() => {
      const hands: boolean[] = [];
      (window as any).avatarStudio.stage.avatar.object.traverse((node: any) => {
        if (node.isMesh && node.userData.avatarRegion?.startsWith("hand-"))
          hands.push(node.visible);
      });
      return hands;
    }),
  ).toEqual([false, false]);
}
function bounded(record: {
  heldTriangles: number;
  visibleTriangles: number;
  effectTriangles: number;
}) {
  expect(record.heldTriangles).toBeLessThanOrEqual(2200);
  expect(record.visibleTriangles).toBeLessThanOrEqual(16000);
  expect(record.effectTriangles).toBeLessThanOrEqual(512);
}

test("five exported items and both gripping hands render with their shipping active behaviors", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = errorsFrom(page);
  await page.goto("/");
  const result = await page.evaluate(
    async (url) => (await import(url)).renderWieldStudy(),
    fixture,
  );
  expect(result.itemRecords).toHaveLength(15);
  expect(result.gripRecords).toHaveLength(30);
  expect(result.actionRecords).toHaveLength(15);
  expect(new Set(result.itemRecords.map((row: any) => row.id)).size).toBe(5);
  expect(new Set(result.gripRecords.map((row: any) => row.hand))).toEqual(
    new Set(["left", "right"]),
  );
  for (const record of result.itemRecords)
    expect(record.triangles).toBeLessThanOrEqual(600);
  for (const record of [...result.gripRecords, ...result.actionRecords])
    bounded(record);
  for (const record of result.actionRecords) expect(record.changed).toBe(true);
  for (const id of [
    "wield-bubble-comet",
    "wield-bonk-bouquet",
    "wield-firefly-lantern",
    "wield-doodle-rocket",
  ])
    expect(
      result.actionRecords.some(
        (row: any) => row.id === id && row.activeEffects > 0,
      ),
      `${id} must draw its active effect`,
    ).toBe(true);
  expect(new Set(result.events.map((event: any) => event.type))).toEqual(
    new Set([
      "bubble",
      "bonk",
      "light",
      "ink-point",
      "spin-start",
      "spin-release",
    ]),
  );
  expect(result.errors).toEqual([]);
  expect(errors).toEqual([]);
  await mkdir(evidence, { recursive: true });
  for (const name of ["items", "grips", "actions"] as const)
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
        grips: result.gripRecords,
        actions: result.actionRecords,
        events: result.events,
      },
      null,
      2,
    ) + "\n",
  );
});

test("all 36 loadouts, sustained dual bubbles and reduced motion retain bounded independent resources", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = errorsFrom(page);
  await page.goto("/");
  const result = await page.evaluate(
    async (url) => (await import(url)).exerciseWieldRuntime(),
    fixture,
  );
  expect(result.combinations).toHaveLength(36);
  for (const row of result.combinations) {
    bounded(row);
    expect(row.actualVisible).toBeLessThanOrEqual(16000);
    expect(row.states.every((state: string) => state === "ready")).toBe(true);
  }
  expect(result.independent).toBe(true);
  expect(result.allocationsStable).toBe(true);
  expect(result.appearanceRetained).toBe(true);
  expect(result.simulatedSeconds).toBeGreaterThanOrEqual(60);
  expect(result.maximumEffects).toBeGreaterThan(0);
  expect(result.maximumEffects).toBeLessThanOrEqual(512);
  for (const sample of result.sustained)
    expect(sample).toEqual(result.sustained[0]);
  for (const sample of result.lifecycle)
    expect(sample).toEqual(result.baseline);
  expect(result.reduced).toHaveLength(5);
  for (const row of result.reduced) {
    expect(row.stable, row.id).toBe(true);
    bounded(row);
  }
  expect(result.errors).toEqual([]);
  expect(errors).toEqual([]);
  await mkdir(evidence, { recursive: true });
  await writeFile(
    `${evidence}/browser-runtime.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
});

test("studio equips either hand, reports pending downloads, uses pointer and keyboard input, and preserves customization", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = errorsFrom(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/wield-bonk-bouquet.glb", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).avatarStudio?.wield);
  await expect(page.locator("#wield-panel")).toBeVisible();
  const before = await page.evaluate(() => (window as any).avatarStudio.recipe);
  await page.locator("#wield-demo").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).avatarStudio.wield.loadout))
    .toMatchObject({
      left: "wield-firefly-lantern",
      right: "wield-bubble-comet",
    });
  try {
    await page.locator("#wield-left").selectOption("wield-bonk-bouquet");
    await expect(page.locator("#wield-status")).toContainText(
      /loading|preparing|equipping|getting.*ready/i,
    );
    expect(
      await page.evaluate(
        () => (window as any).avatarStudio.wield.getHand("left").item.id,
      ),
    ).toBe("wield-firefly-lantern");
  } finally {
    release();
  }
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.wield.loadout.left),
    )
    .toBe("wield-bonk-bouquet");
  await page.locator("#wield-left").selectOption("wield-bubble-comet");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.wield.loadout.left),
    )
    .toBe("wield-bubble-comet");
  expect(
    await page.evaluate(() => (window as any).avatarStudio.recipe),
  ).toEqual(before);
  await expectRelaxedHandsHidden(page);
  await page.evaluate(() => {
    const app = (window as any).avatarStudio;
    (window as any).heldBefore = [
      app.wield.getHand("left").object,
      app.wield.getHand("right").object,
    ];
  });
  await page.locator('[data-category="shirt"]').click();
  await page.locator('[data-part="shirt-tide"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.parts.shirt),
    )
    .toBe("shirt-tide");
  await page.getByLabel("Body weight", { exact: true }).press("End");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).avatarStudio.recipe.body?.weight),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => {
      const app = (window as any).avatarStudio;
      return ["left", "right"].every(
        (hand, i) =>
          app.wield.getHand(hand).object === (window as any).heldBefore[i],
      );
    }),
  ).toBe(true);
  await expectRelaxedHandsHidden(page);
  await page.locator("#wield-use-right").focus();
  await page.keyboard.down("q");
  await page.keyboard.down("e");
  try {
    await expect
      .poll(() => activeParticles(page, "avatarStudio", "left"))
      .toBeGreaterThan(0);
    await expect
      .poll(() => activeParticles(page, "avatarStudio", "right"))
      .toBeGreaterThan(0);
    await page.keyboard.up("q");
    await expect
      .poll(() => activeParticles(page, "avatarStudio", "left"))
      .toBe(0);
    expect(
      await activeParticles(page, "avatarStudio", "right"),
    ).toBeGreaterThan(0);
  } finally {
    await page.keyboard.up("q");
    await page.keyboard.up("e");
  }
  await expect.poll(() => activeParticles(page, "avatarStudio")).toBe(0);
  for (const [hand, key] of [
    ["left", "Space"],
    ["right", "Enter"],
  ] as const) {
    await page.locator(`#wield-use-${hand}`).focus();
    await page.keyboard.down(key);
    try {
      await expect
        .poll(() => activeParticles(page, "avatarStudio", hand))
        .toBeGreaterThan(0);
      await expect(page.locator(`#wield-use-${hand}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await page.keyboard.up(key);
    }
    await expect(page.locator(`#wield-use-${hand}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
  await expect.poll(() => activeParticles(page, "avatarStudio")).toBe(0);
  await page
    .locator("#wield-use-left")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#wield-use-left")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => activeParticles(page, "avatarStudio", "left"))
    .toBeGreaterThan(0);
  await page
    .locator("#wield-use-left")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#wield-use-left")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect.poll(() => activeParticles(page, "avatarStudio")).toBe(0);
  await page.locator("#wield-use-right").hover();
  await page.mouse.down();
  try {
    await expect
      .poll(() => activeParticles(page, "avatarStudio"))
      .toBeGreaterThan(0);
    await mkdir(evidence, { recursive: true });
    await page
      .locator("#stage")
      .screenshot({ path: `${evidence}/studio-dual-bubbles.png` });
  } finally {
    await page.mouse.up();
  }
  await page.locator('[data-inspect="base"]').click();
  await expect(page.locator("#wield-use-right")).toBeHidden();
  expect(
    await page.evaluate(() => {
      const app = (window as any).avatarStudio;
      const visible = (node: any) => {
        for (; node; node = node.parent) if (!node.visible) return false;
        return true;
      };
      const attached = (node: any) => {
        for (; node; node = node.parent)
          if (node === app.stage.avatar.object) return true;
        return false;
      };
      const relaxed: any[] = [];
      app.stage.avatar.object.traverse((node: any) => {
        if (node.isMesh && node.userData.avatarRegion?.startsWith("hand-"))
          relaxed.push(node);
      });
      return {
        heldHidden: ["left", "right"].every(
          (hand) =>
            !attached(app.wield.getHand(hand).object) ||
            !visible(app.wield.getHand(hand).object),
        ),
        relaxedVisible: relaxed.length === 2 && relaxed.every(visible),
      };
    }),
  ).toEqual({ heldHidden: true, relaxedVisible: true });
  await page.locator('[data-inspect="avatar"]').click();
  await expect(page.locator("#wield-use-right")).toBeVisible();
  await expectRelaxedHandsHidden(page);
  expect(
    await page.evaluate(() => {
      const app = (window as any).avatarStudio;
      return ["left", "right"].every(
        (hand, i) =>
          app.wield.getHand(hand).object === (window as any).heldBefore[i] &&
          app.wield.getHand(hand).object.parent.visible,
      );
    }),
  ).toBe(true);
  await page.locator("#capture-views").click();
  await expect(page.locator("#projection-note")).toBeVisible();
  await expect(page.locator("#wield-use-right")).toBeDisabled();
  const capture = await page.evaluate(async () => {
    const app = (window as any).avatarStudio;
    const matrices = () =>
      ["left", "right"].map((hand) =>
        app.wield.getHand(hand).object.matrixWorld.toArray(),
      );
    const before = matrices();
    for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
    return {
      metadata: app.stage.projectionMetadata(),
      frozen: JSON.stringify(before) === JSON.stringify(matrices()),
    };
  });
  expect(capture.metadata.frames).toHaveLength(16);
  expect(capture.frozen).toBe(true);
  await page
    .locator("#stage")
    .screenshot({ path: `${evidence}/studio-frozen-wield.png` });
  await page.locator("#live-view").click();
  await expect(page.locator("#wield-use-right")).toBeEnabled();
  await page.locator("#wield-clear").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).avatarStudio.wield.loadout))
    .toMatchObject({ left: null, right: null });
  await expect(page.locator("#wield-status")).not.toHaveClass(/error/);
  expect(errors).toEqual([]);
});

test("standalone Pocket Play consumes the public API with two hands, responsive framing, and cancelled input", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = errorsFrom(page);
  let releaseDownload!: () => void;
  const downloadGate = new Promise<void>((resolve) => {
    releaseDownload = resolve;
  });
  await page.route("**/wield-bonk-bouquet.glb", async (route) => {
    await downloadGate;
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/wield.html");
  await page.waitForFunction(() => !!(window as any).wieldPlayground);
  await expect(page.locator("#toy-reduced")).toBeChecked();
  for (const hand of ["left", "right"])
    await expect(page.locator(`#toy-${hand} option`)).toHaveCount(6);
  await expect(page.locator("#toy-status")).not.toHaveClass(/error/);
  await page.locator("#toy-reduced").uncheck();
  await page.locator("#use-right").focus();
  await page.keyboard.down("e");
  try {
    await expect
      .poll(() => activeParticles(page, "wieldPlayground"))
      .toBeGreaterThan(0);
    await page.locator("#toy-left").selectOption("wield-bonk-bouquet");
    await expect(page.locator("#toy-status")).toContainText("Unpacking");
    await expect(page.locator("#use-right")).toBeEnabled();
    await expect(page.locator("#use-right")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await page.evaluate(
        () => (window as any).wieldPlayground.wield.getHand("left").item.id,
      ),
    ).toBe("wield-firefly-lantern");
    releaseDownload();
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).wieldPlayground.wield.loadout.left),
      )
      .toBe("wield-bonk-bouquet");
    await expect(page.locator("#use-right")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect
      .poll(() => activeParticles(page, "wieldPlayground"))
      .toBeGreaterThan(1);
  } finally {
    releaseDownload();
    await page.keyboard.up("e");
  }
  const items = [
    "bubble-comet",
    "bonk-bouquet",
    "firefly-lantern",
    "doodle-rocket",
    "whirl-pop",
  ];
  for (let i = 0; i < items.length; i++) {
    const left = `wield-${items[i]}`,
      right = `wield-${items[(i + 1) % items.length]}`;
    await page.locator("#toy-left").selectOption(left);
    await page.locator("#toy-right").selectOption(right);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).wieldPlayground.wield.loadout),
      )
      .toMatchObject({ left, right });
  }
  await page.locator("#toy-left").selectOption("wield-bubble-comet");
  await page.locator("#toy-right").selectOption("wield-bubble-comet");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).wieldPlayground.wield.loadout),
    )
    .toMatchObject({ left: "wield-bubble-comet", right: "wield-bubble-comet" });
  await page.evaluate(() => {
    const app = (window as any).wieldPlayground;
    (window as any).playgroundHeld = [
      app.wield.getHand("left").object,
      app.wield.getHand("right").object,
    ];
  });
  await page.locator("#toy-look").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).wieldPlayground.avatar.recipe.parts.hair,
      ),
    )
    .toBe("hair-halo");
  await page.locator("#toy-weight").press("End");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).wieldPlayground.avatar.recipe.body?.weight,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => {
      const app = (window as any).wieldPlayground;
      return ["left", "right"].every(
        (hand, i) =>
          app.wield.getHand(hand).object === (window as any).playgroundHeld[i],
      );
    }),
  ).toBe(true);
  await page.locator("#use-right").focus();
  await page.keyboard.down("q");
  await page.keyboard.down("e");
  try {
    await expect
      .poll(() => activeParticles(page, "wieldPlayground"))
      .toBeGreaterThan(0);
    await expect(page.locator("#use-left")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#use-right")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator("#use-left")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("#use-right")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  } finally {
    await page.keyboard.up("q");
    await page.keyboard.up("e");
  }
  for (const [hand, key] of [
    ["left", "Space"],
    ["right", "Enter"],
  ] as const) {
    await page.locator(`#use-${hand}`).focus();
    await page.keyboard.down(key);
    try {
      await expect
        .poll(() => activeParticles(page, "wieldPlayground", hand))
        .toBeGreaterThan(0);
    } finally {
      await page.keyboard.up(key);
    }
    await expect(page.locator(`#use-${hand}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => activeParticles(page, "wieldPlayground")).toBe(0);
  await page
    .locator("#use-left")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#use-left")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => activeParticles(page, "wieldPlayground", "left"))
    .toBeGreaterThan(0);
  await page
    .locator("#use-left")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#use-left")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page
    .locator("#use-left")
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator("#use-left")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#toy-left").selectOption("wield-whirl-pop");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).wieldPlayground.wield.loadout.left),
    )
    .toBe("wield-whirl-pop");
  await expect(page.locator("#use-left")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#toy-left").selectOption("wield-bubble-comet");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).wieldPlayground.wield.loadout.left),
    )
    .toBe("wield-bubble-comet");
  await page.locator("#toy-reduced").check();
  await expect.poll(() => activeParticles(page, "wieldPlayground")).toBe(0);
  for (const size of [
    { width: 1440, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const view of ["front", "side", "back"]) {
      await page.locator(`[data-camera="${view}"]`).click();
      const projected = await page.evaluate(() => {
        const app = (window as any).wieldPlayground;
        app.avatar.object.updateWorldMatrix(true, true);
        app.camera.updateMatrixWorld(true);
        let maxX = 0,
          maxY = 0,
          count = 0;
        app.avatar.object.traverseVisible((node: any) => {
          if (
            !node.isMesh ||
            node.isInstancedMesh ||
            node.userData.comicOutline
          )
            return;
          const point = node.position.clone();
          for (let i = 0; i < node.geometry.attributes.position.count; i++) {
            node
              .getVertexPosition(i, point)
              .applyMatrix4(node.matrixWorld)
              .project(app.camera);
            maxX = Math.max(maxX, Math.abs(point.x));
            maxY = Math.max(maxY, Math.abs(point.y));
            count++;
          }
        });
        return {
          maxX,
          maxY,
          count,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(projected.count).toBeGreaterThan(1000);
      expect(projected.maxX).toBeLessThan(0.98);
      expect(projected.maxY).toBeLessThan(0.98);
      expect(projected.overflow).toBe(false);
    }
  }
  await page.locator('[data-camera="front"]').click();
  await page.locator("#toy-left").selectOption("wield-firefly-lantern");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).wieldPlayground.wield.loadout.left),
    )
    .toBe("wield-firefly-lantern");
  await page.locator("#use-left").click();
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/playground-portrait.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.locator("#toy-reduced").uncheck();
  await page.locator("#use-right").hover();
  await page.mouse.down();
  try {
    await expect
      .poll(() => page.locator("#toy-events li").count())
      .toBeGreaterThan(0);
    await expect
      .poll(() => activeParticles(page, "wieldPlayground"))
      .toBeGreaterThan(1);
    await page.screenshot({
      path: `${evidence}/playground.png`,
      fullPage: true,
    });
  } finally {
    await page.mouse.up();
  }
  expect(await page.locator("#toy-events li").count()).toBeLessThanOrEqual(6);
  bounded(
    await page.evaluate(() =>
      (window as any).wieldPlayground.wield.diagnostics(),
    ),
  );
  await page.locator("#toy-clear").click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).wieldPlayground.wield.loadout),
    )
    .toMatchObject({ left: null, right: null });
  expect(errors).toEqual([]);
});
