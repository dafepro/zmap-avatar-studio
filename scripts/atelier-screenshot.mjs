import { chromium } from "playwright";
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : { channel: "chromium" }),
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1160 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text());
});
await page.goto(
  process.env.ATELIER_TEST_URL ?? "http://127.0.0.1:5180/atelier.html",
);
await page.waitForFunction(
  () => window.__atelier && !window.__atelier.busy,
  undefined,
  { timeout: 60000 },
);
await page.locator(".thumb img.loaded").first().waitFor({ timeout: 60000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "outputs/SHIFT-first-look.png", fullPage: true });
console.log(await page.locator("#change-status").textContent());
await browser.close();
