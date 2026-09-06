import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5181",
    channel: process.env.ZMAP_BROWSER_CHANNEL || "chrome",
    viewport: { width: 1440, height: 1080 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5181",
    env: { AVATAR_PORT: "5181" },
    reuseExistingServer: false,
  },
});
