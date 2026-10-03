import { defineConfig } from "@playwright/test";
import base from "./playwright.atelier.config";
export default defineConfig({ ...base, testMatch: "moonwake-set.spec.ts" });
