import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "zmap-avatar-consumer-"));
const run = (bin, args, cwd = dir) => {
  try {
    return execFileSync(bin, args, {
      cwd,
      stdio: "pipe",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    if (error.stdout?.length) process.stderr.write(error.stdout);
    if (error.stderr?.length) process.stderr.write(error.stderr);
    throw error;
  }
};
let browser, server;
try {
  run("npm", ["pack", "--pack-destination", dir], root);
  const archive = readdirSync(dir).find((file) => file.endsWith(".tgz"));
  if (!archive) throw Error("npm pack did not create an archive");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "zmap-avatar-independent-consumer",
      private: true,
      type: "module",
    }),
  );
  run("npm", [
    "install",
    join(dir, archive),
    "@types/node@^22",
    "@types/three@^0.180",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);

  // Node proves ESM exports and packaged binary integrity. Actual texture decoding belongs to a browser.
  writeFileSync(
    join(dir, "check.mjs"),
    `
import { AvatarLibrary, ComicStyle, bakeDirectionalAtlas, directionIndex } from '@zmap/avatar-studio';
import { validateCatalog, inspectGlb } from '@zmap/avatar-studio/core';
import { readFile } from 'node:fs/promises';
const base = new URL('./node_modules/@zmap/avatar-studio/public/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', base), 'utf8'));
validateCatalog(catalog);
for (const asset of catalog.assets) {
  const bytes = await readFile(new URL(asset.url, base));
  inspectGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), asset);
}
if ([AvatarLibrary, ComicStyle, bakeDirectionalAtlas, directionIndex].some(value => typeof value !== 'function')) throw Error('Incomplete ESM exports');
`,
  );
  run("node", ["check.mjs"]);

  cpSync(
    join(dir, "node_modules/@zmap/avatar-studio/public"),
    join(dir, "public/avatars"),
    { recursive: true },
  );
  const source = `
import * as THREE from 'three';
import { AvatarLibrary, ComicStyle, bakeDirectionalAtlas } from '@zmap/avatar-studio';
import { defaultRecipe } from '@zmap/avatar-studio/core';
async function check() {
  const base = new URL('./avatars/', location.href);
  const catalog = await (await fetch(new URL('catalog.json', base))).json();
  const library = new AvatarLibrary(catalog, base.href);
  const create = await library.prepare(defaultRecipe(library.catalog));
  const avatar = create();
  const scene = new THREE.Scene();
  scene.add(avatar.object);
  const character = avatar.asCharacter();
  character.update({vx:1,vz:0,gesture:0}, 1);
  let skinnedMeshes = 0, paintedMeshes = 0;
  avatar.object.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) skinnedMeshes++;
    if (object instanceof THREE.Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ((material as THREE.MeshStandardMaterial).map) paintedMeshes++;
      }
    }
  });
  if (!skinnedMeshes || !paintedMeshes) throw Error('Packed kit is missing decoded skinning or painted face assets');
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setSize(256, 256);
  renderer.setClearColor(0, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const style = new ComicStyle();
  style.update(avatar.object.children[0], new THREE.Vector2(256,256));
  const camera = new THREE.OrthographicCamera(-1.15,1.15,1.15,-1.15,.01,10);
  camera.position.set(0,1,4);
  camera.lookAt(0,1,0);
  renderer.render(scene, camera);
  const gl = renderer.getContext(), pixels = new Uint8Array(256*256*4);
  gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let visiblePixels = 0;
  for (let offset=3;offset<pixels.length;offset+=4) if(pixels[offset]>10) visiblePixels++;
  if (visiblePixels < 1000) throw Error('Independent consumer did not render an avatar');
  const atlas = await bakeDirectionalAtlas(renderer, avatar.object, {tileSize:64});
  const result = {triangles:avatar.diagnostics().triangles, skinnedMeshes, paintedMeshes, visiblePixels, directions:atlas.metadata.frames.length};
  atlas.dispose(); style.dispose(); avatar.dispose(); library.dispose(); renderer.dispose(); renderer.forceContextLoss();
  (window as any).consumerResult = {ok:true,...result};
}
void check().catch(error => { (window as any).consumerResult = {ok:false,error:String(error)}; });
`;
  writeFileSync(join(dir, "main.ts"), source);
  run(resolve(root, "node_modules/.bin/tsc"), [
    "--noEmit",
    "--strict",
    "--module",
    "NodeNext",
    "--target",
    "ES2022",
    "--skipLibCheck",
    "main.ts",
  ]);
  writeFileSync(
    join(dir, "index.html"),
    '<div id="app">Independent packed avatar consumer</div><script type="module" src="/main.ts"></script>',
  );
  run(resolve(root, "node_modules/.bin/vite"), ["build"]);

  const dist = join(dir, "dist");
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".glb": "model/gltf-binary",
    ".png": "image/png",
  };
  server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const path = resolve(
        dist,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!path.startsWith(dist + sep)) {
        response.writeHead(403).end();
        return;
      }
      const data = readFileSync(path);
      response.writeHead(200, {
        "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      });
      response.end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({
    channel: process.env.ZMAP_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /shader|GL_INVALID|WebGL/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.consumerResult, undefined, {
    timeout: 30000,
  });
  const result = await page.evaluate(() => window.consumerResult);
  if (!result.ok || errors.length)
    throw Error(JSON.stringify({ result, errors }));
  console.log(
    "Packed independent consumer passed: ESM exports, every packaged GLB contract, TypeScript declarations, production build, real browser texture decode/skinning/render and 16-direction capture.",
    result,
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
