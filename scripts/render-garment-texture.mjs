import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { deflateSync, inflateSync } from "node:zlib";

// Recompress the browser's lossless PNG stream; pixels and RGBA stay identical.
function compressPng(bytes) {
  const chunks = [],
    imageData = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at),
      type = bytes.toString("ascii", at + 4, at + 8);
    const chunk = bytes.subarray(at, at + length + 12);
    if (type === "IDAT")
      imageData.push(bytes.subarray(at + 8, at + 8 + length));
    else chunks.push(chunk);
    at += length + 12;
  }
  const data = deflateSync(inflateSync(Buffer.concat(imageData)), { level: 9 });
  const idat = Buffer.alloc(data.length + 12);
  idat.writeUInt32BE(data.length);
  idat.write("IDAT", 4);
  data.copy(idat, 8);
  let crc = 0xffffffff;
  for (const byte of idat.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  idat.writeUInt32BE((crc ^ 0xffffffff) >>> 0, idat.length - 4);
  chunks.splice(chunks.length - 1, 0, idat);
  return Buffer.concat([bytes.subarray(0, 8), ...chunks]);
}

const source = new URL("../assets/textures/garment-wash.svg", import.meta.url);
const output = new URL("../assets/textures/garment-wash.png", import.meta.url);
const alphaOutput = new URL(
  "../assets/textures/garment-wash-alpha.png",
  import.meta.url,
);
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
        canvas.width = canvas.height = 512;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const transparent = canvas.toDataURL("image/png");
        const alpha = context.getImageData(0, 0, 512, 512).data;
        let empty = 0,
          partial = 0;
        for (let i = 3; i < alpha.length; i += 4) {
          if (alpha[i] === 0) empty++;
          else if (alpha[i] < 255) partial++;
        }
        const runtime = document.createElement("canvas");
        runtime.width = runtime.height = 256;
        const runtimeContext = runtime.getContext("2d");
        runtimeContext.fillStyle = "#ffffff";
        runtimeContext.fillRect(0, 0, 256, 256);
        runtimeContext.drawImage(image, 0, 0, 256, 256);
        const rgba = runtimeContext.getImageData(0, 0, 256, 256).data;
        let darkest = 255,
          opaque = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          darkest = Math.min(darkest, rgba[i], rgba[i + 1], rgba[i + 2]);
          if (rgba[i + 3] === 255) opaque++;
        }
        const centre = [
          ...rgba.slice((100 * 256 + 128) * 4, (100 * 256 + 128) * 4 + 4),
        ];
        return {
          transparent,
          white: runtime.toDataURL("image/png"),
          empty,
          partial,
          darkest,
          opaque,
          centre,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    await readFile(source, "utf8"),
  );
  if (result.empty < 190000 || result.partial < 15000)
    throw Error(
      "Drawn wash must retain mostly empty alpha and soft pigment layers",
    );
  if (
    result.opaque !== 256 * 256 ||
    result.darkest < 140 ||
    result.darkest > 225
  )
    throw Error(
      "Runtime multiplication map must have bounded pale shading and opaque white backing",
    );
  if (result.centre.join(",") !== "255,255,255,255")
    throw Error(
      "Central chest area must remain unpainted for the existing crest",
    );
  const png = compressPng(Buffer.from(result.white.split(",")[1], "base64"));
  if (
    png.readUInt32BE(16) !== 256 ||
    png.readUInt32BE(20) !== 256 ||
    png[25] !== 6
  )
    throw Error("Runtime garment map must be a 256×256 RGBA PNG");
  if (png.byteLength > 40000)
    throw Error("Garment map exceeds 40 KB artwork budget");
  await writeFile(output, png);
  await writeFile(
    alphaOutput,
    compressPng(Buffer.from(result.transparent.split(",")[1], "base64")),
  );
  console.log(
    JSON.stringify(
      {
        output: fileURLToPath(output),
        bytes: png.length,
        empty: result.empty,
        partial: result.partial,
        darkest: result.darkest,
        centre: result.centre,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
