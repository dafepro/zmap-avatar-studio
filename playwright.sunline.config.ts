import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "sunline-courier.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.ATELIER_TEST_URL ?? "http://127.0.0.1:5186",
    viewport: { width: 1440, height: 1160 },
    trace: "retain-on-failure",
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : { channel: "chromium" }),
      args: ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
    },
  },
  ...(process.env.ATELIER_TEST_URL
    ? {}
    : {
        webServer: {
          command: "npx vite --host 127.0.0.1",
          url: "http://127.0.0.1:5186",
          env: { AVATAR_PORT: "5186" },
          reuseExistingServer: false,
        },
      }),
});
