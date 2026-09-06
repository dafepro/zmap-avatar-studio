import { defineConfig } from "vite";
export default defineConfig({
  root: "app",
  publicDir: "../public",
  server: { port: Number(process.env.AVATAR_PORT ?? 5180), strictPort: true },
  build: { outDir: "../dist", emptyOutDir: true },
});
