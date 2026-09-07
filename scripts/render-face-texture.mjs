import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const basename = process.argv[2] || "face-ink";
if (!/^[a-z0-9-]+$/.test(basename)) throw Error("Invalid texture name");
const source = new URL(`../assets/textures/${basename}.svg`, import.meta.url);
const output = new URL(`../assets/textures/${basename}.png`, import.meta.url);
const browser = await chromium.launch({
  channel: process.env.ZMAP_BROWSER_CHANNEL || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async (svg) => {
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1024;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 1024, 1024).data;
        const cells = Array.from({ length: 4 }, () => ({
          opaque: 0,
          partial: 0,
          empty: 0,
        }));
        for (let y = 0; y < 1024; y++)
          for (let x = 0; x < 1024; x++) {
            const alpha = pixels[(y * 1024 + x) * 4 + 3],
              cell = cells[Math.floor(y / 512) * 2 + Math.floor(x / 512)];
            if (alpha === 0) cell.empty++;
            else if (alpha === 255) cell.opaque++;
            else cell.partial++;
          }
        return { data: canvas.toDataURL("image/png"), cells };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    await readFile(source, "utf8"),
  );
  if (result.cells[3].empty < 200000 || result.cells[3].opaque < 8000)
    throw Error("Profile strips need clear alpha gutters and visible ink");
  for (const cell of result.cells.slice(0, 3)) {
    if (cell.empty < 180000 || cell.opaque < 15000 || cell.partial < 1000)
      throw Error(
        "Expression must contain opaque art, antialiased contours and mostly empty alpha",
      );
  }
  await writeFile(output, Buffer.from(result.data.split(",")[1], "base64"));
  console.log(
    JSON.stringify(
      { output: fileURLToPath(output), cells: result.cells },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
