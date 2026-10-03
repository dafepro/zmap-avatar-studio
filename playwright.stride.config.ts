import { defineConfig } from "@playwright/test";
import atelier from "./playwright.atelier.config";

export default defineConfig({
  ...atelier,
  testDir: "tests/stride-browser",
  testMatch: "stride.spec.ts",
  timeout: 90000,
});
