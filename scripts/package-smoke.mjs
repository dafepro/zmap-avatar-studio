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

  // A data-only consumer must not pull in Three.js or the rendering runtime.
  writeFileSync(
    join(dir, "data-only-loader.mjs"),
    `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three' || specifier.startsWith('three/')) throw Error('Data-only export imported Three.js');
  return nextResolve(specifier, context);
}
`,
  );
  writeFileSync(
    join(dir, "register-data-only.mjs"),
    `import { register } from 'node:module'; register('./data-only-loader.mjs', import.meta.url);`,
  );
  writeFileSync(
    join(dir, "check-wield-core.mjs"),
    `
import { validateWieldCatalog, validateWieldLoadout, emptyWieldLoadout, wieldAssetDescriptor, WIELD_LIMITS } from '@zmap/avatar-studio/wield-core';
import { inspectGlb } from '@zmap/avatar-studio/core';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const packageRoot = new URL('./node_modules/@zmap/avatar-studio/', import.meta.url);
// Equipment is an explicitly loaded, separate catalog; appearance-only consumers need not fetch it.
const base = new URL('public/wield/', packageRoot);
const catalog = JSON.parse(await readFile(new URL('catalog.json', base), 'utf8'));
validateWieldCatalog(catalog);
validateWieldLoadout(emptyWieldLoadout(catalog), catalog);
const assets = [...Object.values(catalog.grips), ...catalog.items];
if (assets.length !== 7 || catalog.items.length !== 5) throw Error('Packed playful equipment collection is incomplete');
for (const asset of assets) {
  const bytes = await readFile(new URL(asset.url, base));
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('Packed equipment integrity mismatch: ' + asset.id);
  inspectGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), wieldAssetDescriptor(asset, catalog.rig));
}
const fieldBase = new URL('public/action/', packageRoot);
const fieldCatalog = JSON.parse(await readFile(new URL('catalog.json', fieldBase), 'utf8'));
validateWieldCatalog(fieldCatalog);
if (fieldCatalog.items.length !== 3 || fieldCatalog.items.some(item => !item.twoHanded)) throw Error('Packed shared field collection is incomplete');
const fieldAssets = [...Object.values(fieldCatalog.grips), ...fieldCatalog.items];
if (fieldAssets.length !== 5) throw Error('Packed field grip pair is incomplete');
for (const asset of fieldAssets) {
  const bytes = await readFile(new URL(asset.url, fieldBase));
  if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw Error('Packed field integrity mismatch: ' + asset.id);
  inspectGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), wieldAssetDescriptor(asset, fieldCatalog.rig));
}
for (const item of fieldCatalog.items) validateWieldLoadout({...emptyWieldLoadout(fieldCatalog), twoHanded:{item:item.id, primary:'left'}}, fieldCatalog);
if (!WIELD_LIMITS.held || !WIELD_LIMITS.visible || !WIELD_LIMITS.twoHandItem) throw Error('Missing public equipment budgets');
`,
  );
  run("node", ["--import", "./register-data-only.mjs", "check-wield-core.mjs"]);

  // Node proves ESM exports and packaged binary integrity. Actual texture decoding belongs to a browser.
  writeFileSync(
    join(dir, "check.mjs"),
    `
import { AvatarLibrary, ComicStyle, bakeDirectionalAtlas, directionIndex, WieldLibrary, WieldController, playfulWieldBehaviors, fieldToolBehaviors } from '@zmap/avatar-studio';
import { validateCatalog, inspectGlb } from '@zmap/avatar-studio/core';
import { readFile } from 'node:fs/promises';
const base = new URL('./node_modules/@zmap/avatar-studio/public/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', base), 'utf8'));
validateCatalog(catalog);
for (const asset of catalog.assets) {
  const bytes = await readFile(new URL(asset.url, base));
  inspectGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), asset);
}
if ([AvatarLibrary, ComicStyle, bakeDirectionalAtlas, directionIndex, WieldLibrary, WieldController, playfulWieldBehaviors, fieldToolBehaviors].some(value => typeof value !== 'function')) throw Error('Incomplete ESM exports');
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
import { AvatarLibrary, ComicStyle, bakeDirectionalAtlas, WieldLibrary, WieldController, playfulWieldBehaviors, fieldToolBehaviors, disposeAvatarResources, type WieldEvent } from '@zmap/avatar-studio';
import { defaultRecipe } from '@zmap/avatar-studio/core';
import { emptyWieldLoadout, WIELD_LIMITS } from '@zmap/avatar-studio/wield-core';
async function check() {
  const base = new URL('./avatars/', location.href);
  const catalog = await (await fetch(new URL('catalog.json', base))).json();
  const library = new AvatarLibrary(catalog, base.href);
  const recipe = defaultRecipe(library.catalog);
  recipe.body = { weight: 0.7 };
  Object.assign(recipe.parts, { head: 'head-spark', hair: 'hair-pony', eyewear: 'acc-glasses', facialHair: 'facial-mustache', headwear: 'hat-club-cap' });
  const create = await library.prepare(recipe);
  const avatar = create();
  const scene = new THREE.Scene();
  scene.add(avatar.object);
  const character = avatar.asCharacter();
  character.update({vx:1,vz:0,gesture:0}, 1);
  const wieldBase = new URL('wield/', base);
  const wieldCatalog = await (await fetch(new URL('catalog.json', wieldBase))).json();
  const wieldLibrary = new WieldLibrary(wieldCatalog, wieldBase.href);
  const wieldEvents: WieldEvent[] = [], wieldErrors: string[] = [];
  const wield = new WieldController(avatar, wieldLibrary, playfulWieldBehaviors(), {
    onEvent: event => wieldEvents.push(event),
    onError: error => wieldErrors.push(String(error)),
  });
  const loadout = {
    ...emptyWieldLoadout(wieldLibrary.catalog),
    left: 'wield-firefly-lantern',
    right: 'wield-whirl-pop',
  };
  if (!await wield.setLoadout(loadout)) throw Error('Dual-hand loadout did not commit');
  const left = wield.getHand('left'), right = wield.getHand('right');
  if (left?.state !== 'ready' || right?.state !== 'ready') throw Error('Both packed held items must be ready');
  if (left.item.id !== loadout.left || right.item.id !== loadout.right) throw Error('Packed hand assignments changed');
  let heldMeshes = 0;
  for (const held of [left, right]) {
    held.object.traverse(object => { if (object instanceof THREE.Mesh) heldMeshes++; });
    if (!held.grip.getObjectByProperty('isMesh', true)) throw Error('Packed grip has no real geometry');
  }
  if (heldMeshes < 4 || !left.anchor('core').children.length || !right.anchor('rotor').children.length) throw Error('Packed movable item geometry is incomplete');
  avatar.update(1.016, { gesture: 'idle' });
  const rotorRest = right.anchor('rotor').quaternion.clone();
  wield.press('left'); wield.press('right');
  avatar.update(1.032, { gesture: 'idle' });
  avatar.update(1.064, { gesture: 'idle' });
  const light = wieldEvents.find(event => event.hand === 'left' && event.itemId === loadout.left && event.type === 'light' && event.value === 1);
  const spin = wieldEvents.find(event => event.hand === 'right' && event.itemId === loadout.right && event.type === 'spin-start');
  if (!light || !spin || light.eventId === spin.eventId) throw Error('Independent left/right behavior events were not delivered');
  for (const event of [light, spin]) {
    if (!event.position?.every(Number.isFinite) || !event.direction?.every(Number.isFinite) || event.sequence < 1) throw Error('Behavior event is missing its resolved anchor or input sequence');
  }
  if (rotorRest.angleTo(right.anchor('rotor').quaternion) < 0.001) throw Error('Packed pinwheel rotor did not animate');
  wield.release('left'); wield.release('right');
  avatar.update(1.08, { gesture: 'idle', reducedMotion: true });
  if (rotorRest.angleTo(right.anchor('rotor').quaternion) > 0.0001) throw Error('Packed pinwheel did not honor reduced motion');
  const wieldDiagnostics = wield.diagnostics();
  if (wieldDiagnostics.equippedHands !== 2 || wieldDiagnostics.heldTriangles > WIELD_LIMITS.held || wieldDiagnostics.visibleTriangles > WIELD_LIMITS.visible || wieldErrors.length) throw Error('Packed equipment failed its runtime contract: ' + JSON.stringify({wieldDiagnostics, wieldErrors}));
  // Swap the exclusive hand lease to an independently loaded two-handed collection.
  wield.dispose(); wieldLibrary.dispose();
  const fieldBase = new URL('action/', base);
  const fieldCatalog = await (await fetch(new URL('catalog.json', fieldBase))).json();
  const fieldLibrary = new WieldLibrary(fieldCatalog, fieldBase.href);
  const fieldAssets = [...fieldLibrary.catalog.items, ...Object.values(fieldLibrary.catalog.grips)];
  for (const asset of fieldAssets) disposeAvatarResources(await fieldLibrary.instantiate(asset));
  let fieldCreated = 0, fieldDisposed = 0;
  const fieldRegistry = fieldToolBehaviors();
  for (const definition of Object.values(fieldRegistry)) {
    const createBehavior = definition.create;
    definition.create = context => {
      fieldCreated++;
      const behavior = createBehavior(context);
      return {...behavior, dispose() { fieldDisposed++; behavior.dispose?.(); }};
    };
  }
  const field = new WieldController(avatar, fieldLibrary, fieldRegistry, {onError: error => wieldErrors.push(String(error))});
  const sharedLoadout = {...emptyWieldLoadout(fieldLibrary.catalog), twoHanded:{item:'wield-tether-winch', primary:'left' as const}};
  if (!await field.setLoadout(sharedLoadout)) throw Error('Packed shared field loadout did not commit');
  const main = field.getHand('left'), support = field.getHand('right');
  if (main?.state !== 'ready' || support?.state !== 'ready' || main.object !== support.object || main.effects !== support.effects || main.grip === support.grip || fieldCreated !== 1) throw Error('Packed shared tool must have one behavior/model and two distinct ready grips');
  const sourceDisposals: number[] = [];
  const watched = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const owner of [main.object, main.grip, support.grip, main.effects]) owner.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])]) {
      if (watched.has(resource)) continue;
      watched.add(resource); const index = sourceDisposals.push(0) - 1;
      resource.addEventListener('dispose', () => sourceDisposals[index]++);
    }
  });
  const spool = main.anchor('spool'), spoolRest = spool.quaternion.clone();
  field.press('right'); avatar.update(1.096);
  if (spoolRest.angleTo(spool.quaternion) > .0001) throw Error('Packed support hand incorrectly activated its shared tool');
  field.press('left'); avatar.update(1.112); avatar.update(1.128);
  if (spoolRest.angleTo(spool.quaternion) < .001) throw Error('Packed primary hand did not animate its real shared mechanism');
  field.release('left');
  avatar.update(1.144, {reducedMotion:true});
  avatar.object.updateMatrixWorld(true);
  for (const hand of ['left', 'right'] as const) {
    const wrist = avatar.attachmentView()!.sockets.get(hand === 'left' ? 'hand_L' : 'hand_R')!;
    const grip = fieldLibrary.catalog.grips[hand].frame;
    const expected = wrist.matrixWorld.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3().fromArray(grip.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...grip.rotation)),new THREE.Vector3(1,1,1)));
    const actual = field.getHand(hand)!.anchor('grip').matrixWorld;
    if (!actual.elements.every((value,index) => Math.abs(value-expected.elements[index]) < 1e-5)) throw Error('Packed ' + hand + ' grip frame is not fitted to the shared model');
  }
  const fieldDiagnostics = field.diagnostics();
  const fieldExpected = main.item.triangles + fieldLibrary.catalog.grips.left.triangles + fieldLibrary.catalog.grips.right.triangles;
  if (fieldDiagnostics.equippedHands !== 2 || fieldDiagnostics.heldTriangles !== fieldExpected || fieldExpected > WIELD_LIMITS.held || fieldDiagnostics.visibleTriangles > WIELD_LIMITS.visible || fieldDiagnostics.effectTriangles > WIELD_LIMITS.effects || wieldErrors.length) throw Error('Packed field tool failed its shared ownership or budgets: ' + JSON.stringify({fieldDiagnostics,wieldErrors}));
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
  const result = {triangles:avatar.diagnostics().triangles, skinnedMeshes, paintedMeshes, visiblePixels, directions:atlas.metadata.frames.length, wieldAssets:7, fieldAssets:fieldAssets.length, fieldHeldTriangles:fieldDiagnostics.heldTriangles, fieldVisibleTriangles:fieldDiagnostics.visibleTriangles, fieldOwners:fieldCreated, fittedFieldHands:fieldDiagnostics.equippedHands, heldMeshes, heldTriangles:wieldDiagnostics.heldTriangles, visibleTriangles:wieldDiagnostics.visibleTriangles, wieldEvents:wieldEvents.map(event => event.hand + ':' + event.type)};
  atlas.dispose(); style.dispose(); field.dispose();
  if (fieldDisposed !== 1 || field.getHand('left') || field.getHand('right') || !sourceDisposals.length || sourceDisposals.some(count => count !== 1)) throw Error('Packed field resources or shared owner were not disposed exactly once');
  fieldLibrary.dispose(); avatar.dispose(); library.dispose(); renderer.dispose(); renderer.forceContextLoss();
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
  readFileSync(
    join(dir, "node_modules/@zmap/avatar-studio/docs/wielding.md"),
    "utf8",
  );
  console.log(
    "Packed independent consumer passed: data-only and runtime ESM exports, docs, every appearance GLB, all seven playful and five field GLBs, TypeScript declarations, production build, independent-hand events and reduced motion, one shared field owner with both complete grip frames and exact disposal, real browser texture decode/skinning/render and 16-direction capture.",
    result,
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}
