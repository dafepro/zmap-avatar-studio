import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: "app",
  publicDir: "../public",
  server: { port: Number(process.env.AVATAR_PORT ?? 5180), strictPort: true },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        studio: fileURLToPath(new URL("./app/index.html", import.meta.url)),
        playground: fileURLToPath(new URL("./app/wield.html", import.meta.url)),
      },
    },
  },
});
