import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "snap-salute.spec.ts",
  timeout: 90000,
  use: {
    ...base.use,
    channel: "chromium",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
});
