import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/action.html");
  await expect(page.locator("#mechanism")).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).fieldTools))
    .toBe(true);
}
async function indicator(page: Page) {
  return page.evaluate(
    () =>
      (window as any).fieldTools.wield
        .getHand("right")
        ?.effects.getObjectByName("field-panel-ready")?.visible ?? false,
  );
}

test("field workbench holds via keyboard and pointer, cancels on focus loss, and shows a static accessible reduced-motion panel indicator", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.locator('[data-item="wield-rebound-panel"]').click();
  await expect(page.locator("#device-name")).toHaveText("Rebound Panel");
  const button = page.locator("#mechanism");
  await button.focus();
  await page.keyboard.down("Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => indicator(page)).toBe(true);
  await page.keyboard.up("Space");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => indicator(page)).toBe(false);
  await page.keyboard.down("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Enter");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => indicator(page)).toBe(false);
  await page.locator("#reduced").check();
  const bounds = (await button.boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await expect.poll(() => indicator(page)).toBe(true);
  const first = await page.evaluate(() => {
    const mesh = (window as any).fieldTools.wield
      .getHand("right")
      .effects.getObjectByName("field-panel-ready");
    return {
      matrix: mesh.matrixWorld.toArray(),
      opacity: mesh.material.opacity,
    };
  });
  await page.waitForTimeout(120);
  expect(
    await page.evaluate(() => {
      const mesh = (window as any).fieldTools.wield
        .getHand("right")
        .effects.getObjectByName("field-panel-ready");
      return {
        matrix: mesh.matrixWorld.toArray(),
        opacity: mesh.material.opacity,
      };
    }),
  ).toEqual(first);
  await page.mouse.up();
  await expect.poll(() => indicator(page)).toBe(false);
  await button.evaluate((element) => (element as HTMLButtonElement).click());
  await expect.poll(() => indicator(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(() => indicator(page)).toBe(false);
  await page.locator("#primary").selectOption("left");
  await expect(button).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as any).fieldTools.wield.loadout.twoHanded.primary,
    ),
  ).toBe("left");
  expect(errors).toEqual([]);
});

test("latest tool selection wins failed delayed loads and failed current loads preserve a usable previous selection", async ({
  page,
}) => {
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    "**/action/models/wield-rebound-panel.glb",
    async (route) => {
      await gate;
      await route.fulfill({ status: 503, body: "delayed failure" });
    },
  );
  await page.locator('[data-item="wield-rebound-panel"]').click();
  await page.locator('[data-item="wield-wake-driver"]').click();
  await expect(page.locator("#device-name")).toHaveText("Wake Driver");
  release();
  await expect
    .poll(() => page.evaluate(() => (window as any).fieldTools.wield.state))
    .toBe("ready");
  await expect(page.locator("#status")).not.toHaveAttribute(
    "data-error",
    "true",
  );
  await page.locator('[data-item="wield-rebound-panel"]').click();
  await expect(page.locator("#status")).toHaveAttribute("data-error", "true");
  await expect(page.locator("#device-name")).toHaveText("Wake Driver");
  await expect(page.locator('[data-item="wield-wake-driver"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#mechanism")).toBeEnabled();
  await page.unroute("**/action/models/wield-rebound-panel.glb");
  await page.locator('[data-item="wield-rebound-panel"]').click();
  await expect(page.locator("#device-name")).toHaveText("Rebound Panel");
  await expect(page.locator("#status")).not.toHaveAttribute(
    "data-error",
    "true",
  );
});

test("workbench teardown during an equipment load cannot resurrect its canvas, objects, or ready UI", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    "**/action/models/wield-rebound-panel.glb",
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  await page.locator('[data-item="wield-rebound-panel"]').click();
  await page.evaluate(() => (window as any).fieldTools.dispose());
  release();
  await expect(page.locator("#stage canvas")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).fieldTools.wield.state))
    .toBe("disposed");
  expect(
    await page.evaluate(
      () => (window as any).fieldTools.avatar.object.children.length,
    ),
  ).toBe(0);
  await expect(page.locator("#mechanism")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("pagehide during initial fetch aborts startup before any graphics owner is created", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/action/catalog.json", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/action.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#status")).toHaveText("Preparing the components…");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  release();
  await page.waitForTimeout(80);
  await expect(page.locator("#stage canvas")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fieldTools)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("touch capture cancellation never leaves the preview pressed on a narrow workbench", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await ready(page);
    await page.locator('[data-item="wield-rebound-panel"]').click();
    await expect(page.locator("#device-name")).toHaveText("Rebound Panel");
    const button = page.locator("#mechanism");
    await button.scrollIntoViewIfNeeded();
    const bounds = (await button.boundingBox())!,
      session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      ],
    });
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => indicator(page)).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await session.detach();
  } finally {
    await context.close();
  }
});
