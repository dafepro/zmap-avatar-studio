import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { ComicStyle } from "../src/comic";
import { defaultRecipe, type Catalog } from "../src/core";
import { emptyWieldLoadout, type WieldCatalog } from "../src/wield-core";
import { WieldController, WieldLibrary } from "../src/wield-runtime";
import { playfulWieldBehaviors } from "../src/wield-behaviors";
import "./helpers/node-image";
const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const equipment: WieldCatalog = JSON.parse(
  await readFile(
    new URL("../public/wield/catalog.json", import.meta.url),
    "utf8",
  ),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("../public" + new URL(String(input)).pathname, import.meta.url),
    ),
  );
const resolution = new THREE.Vector2(800, 600);
function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && !node.userData.comicOutline)
      result.push(node);
  });
  return result;
}
const material = (mesh: THREE.Mesh) =>
  Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
async function setup() {
  const avatars = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    library = new WieldLibrary(
      equipment,
      "https://assets.test/wield/",
      fetcher,
    ),
    avatar = avatars.create();
  await avatar.setAppearance(defaultRecipe(catalog));
  const controller = new WieldController(
      avatar,
      library,
      playfulWieldBehaviors(),
    ),
    style = new ComicStyle();
  style.update(avatar.object.children[0], resolution);
  const equip = async (left: string | null, right: string | null = null) => {
    await controller.setLoadout({
      ...emptyWieldLoadout(equipment),
      left,
      right,
    });
    avatar.update(0);
  };
  const close = () => {
    controller.dispose();
    style.dispose();
    avatar.dispose();
    avatars.dispose();
    library.dispose();
  };
  return { avatar, controller, style, equip, close };
}

test("ComicStyle incrementally paints held items/grips on an existing root and never paints comicSkip effects", async (t) => {
  const s = await setup();
  t.after(s.close);
  const root = s.avatar.object.children[0],
    appearance = meshes(root)[0],
    appearancePaint = appearance.material;
  await s.equip("wield-bubble-comet", "wield-firefly-lantern");
  const held = s.controller.getHand("left")!,
    sourceMesh = meshes(held.object)[0],
    original = material(sourceMesh),
    grip = meshes(held.grip)[0];
  const effectMaterials = new Map<
    THREE.Mesh,
    THREE.Material | THREE.Material[]
  >();
  for (const hand of ["left", "right"] as const)
    for (const effect of meshes(s.controller.getHand(hand)!.effects))
      effectMaterials.set(effect, effect.material);
  s.style.update(root, resolution);
  assert.equal(s.avatar.object.children[0], root);
  assert.equal(appearance.material, appearancePaint);
  assert.notEqual(sourceMesh.material, original);
  assert.equal(material(sourceMesh).userData.illustrated, true);
  assert.equal(material(grip).userData.illustrated, true);
  for (const [effect, source] of effectMaterials) {
    assert.equal(effect.material, source);
    assert.equal(effect.userData.beforeAvatarDispose, undefined);
    assert.equal(
      effect.children.some((node) => node.userData.comicOutline),
      false,
    );
  }
  const paint = sourceMesh.material;
  s.style.update(root, new THREE.Vector2(1000, 700));
  assert.equal(sourceMesh.material, paint);
});

test("appearance swaps preserve held item paint identity and source materials restore without leaked outlines", async (t) => {
  const s = await setup();
  t.after(s.close);
  await s.equip("wield-bonk-bouquet");
  const held = s.controller.getHand("left")!,
    mesh = meshes(held.object)[0],
    original = mesh.material;
  s.style.update(s.avatar.object.children[0], resolution);
  const paint = mesh.material,
    outline = mesh.children.find(
      (node) => node.userData.comicOutline,
    ) as THREE.Mesh;
  assert.ok(outline);
  let originalDisposals = 0,
    paintDisposals = 0,
    outlineDisposals = 0;
  for (const m of Array.isArray(original) ? original : [original])
    m.addEventListener("dispose", () => originalDisposals++);
  for (const m of Array.isArray(paint) ? paint : [paint])
    m.addEventListener("dispose", () => paintDisposals++);
  outline.geometry.addEventListener("dispose", () => outlineDisposals++);
  await s.avatar.setAppearance({ ...s.avatar.recipe!, body: { weight: 0.5 } });
  s.style.update(s.avatar.object.children[0], resolution);
  assert.equal(s.controller.getHand("left"), held);
  assert.equal(mesh.material, paint);
  assert.equal(originalDisposals, 0);
  assert.equal(paintDisposals, 0);
  assert.equal(outlineDisposals, 0);
  s.style.clear(true);
  assert.equal(mesh.material, original);
  assert.equal(
    mesh.children.some((node) => node.userData.comicOutline),
    false,
  );
  assert.equal(paintDisposals, 1);
  assert.equal(outlineDisposals, 1);
  assert.equal(originalDisposals, 0);
  s.controller.dispose();
  assert.equal(originalDisposals, 1);
});

test("unequip disposes source, painted material and outline exactly once through the registered owner callback", async (t) => {
  const s = await setup();
  t.after(s.close);
  await s.equip("wield-whirl-pop");
  const root = s.avatar.object.children[0],
    held = s.controller.getHand("left")!,
    mesh = meshes(held.object)[0],
    original = material(mesh),
    geometry = mesh.geometry;
  s.style.update(root, resolution);
  const paint = material(mesh),
    outline = mesh.children.find(
      (node) => node.userData.comicOutline,
    ) as THREE.Mesh;
  let source = 0,
    painted = 0,
    ink = 0,
    surface = 0;
  original.addEventListener("dispose", () => source++);
  paint.addEventListener("dispose", () => painted++);
  outline.geometry.addEventListener("dispose", () => ink++);
  geometry.addEventListener("dispose", () => surface++);
  assert.equal(typeof mesh.userData.beforeAvatarDispose, "function");
  await s.equip(null);
  s.style.update(root, resolution);
  s.style.dispose();
  assert.equal(mesh.userData.beforeAvatarDispose, undefined);
  assert.equal(mesh.material, original);
  assert.deepEqual(
    { source, painted, ink, surface },
    { source: 1, painted: 1, ink: 1, surface: 1 },
  );
});

test("temporary inspection detachment retains live held source materials and re-show does not repaint disposed paint", async (t) => {
  const s = await setup();
  t.after(s.close);
  await s.equip("wield-whirl-pop");
  const held = s.controller.getHand("left")!,
    mesh = meshes(held.object)[0],
    original = material(mesh);
  let originalDisposals = 0;
  original.addEventListener("dispose", () => originalDisposals++);
  s.style.update(s.avatar.object.children[0], resolution);
  const oldPaint = material(mesh);
  let paintDisposals = 0;
  oldPaint.addEventListener("dispose", () => paintDisposals++);
  s.controller.setVisible(false);
  s.style.update(s.avatar.object.children[0], resolution);
  assert.equal(
    originalDisposals,
    0,
    "hiding still-owned equipment cannot retire its source material",
  );
  assert.equal(
    mesh.material,
    original,
    "removing a temporary style must restore the retained source",
  );
  assert.equal(paintDisposals, 1);
  s.controller.setVisible(true);
  s.style.update(s.avatar.object.children[0], resolution);
  assert.equal(s.controller.getHand("left"), held);
  assert.notEqual(mesh.material, oldPaint);
  assert.equal(material(mesh).userData.illustrated, true);
  assert.equal(originalDisposals, 0);
  s.controller.dispose();
  s.style.dispose();
  assert.equal(originalDisposals, 1);
  assert.equal(paintDisposals, 1);
});
