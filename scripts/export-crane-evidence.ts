/** Actual loaded/fitted/posed runtime vertices for a Blender review renderer.
 * This is a geometry transfer, not a replacement browser/WebGL claim. */
import * as THREE from "three";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { AvatarLibrary, defaultRecipe, type Catalog } from "../src";
import "../tests/helpers/node-image";
// Preserve the exact embedded PNG bytes while the Node loader uses metadata.
const decode = globalThis.createImageBitmap;
globalThis.createImageBitmap = (async (input: Blob) => {
  const bitmap = await decode(input);
  return Object.assign(bitmap, {
    sourcePNG: Buffer.from(await input.arrayBuffer()),
  });
}) as typeof createImageBitmap;
const root = new URL("../", import.meta.url);
const base: Catalog = JSON.parse(
  await readFile(new URL("public/catalog.json", root), "utf8"),
);
const parts = [
  JSON.parse(
    await readFile(
      new URL("public/capsule/parts/hair-crane.json", root),
      "utf8",
    ),
  ),
];
const catalog: Catalog = { ...base, assets: [...base.assets, ...parts] };
const custom = new Set(parts.map((part: { url: string }) => part.url));
const fetcher: typeof fetch = async (input) => {
  const file = new URL(String(input)).pathname.slice(1);
  return new Response(
    await readFile(
      new URL(`public/${custom.has(file) ? "capsule/" : ""}${file}`, root),
    ),
  );
};
const library = new AvatarLibrary(catalog, "https://crane.test/", fetcher);
const out = process.argv[2] || "/tmp/crane-runtime";
await mkdir(out, { recursive: true });
const textureWrites: Promise<void>[] = [];
const textureNames = new Map<THREE.Texture, string>();
function textureFile(texture: THREE.Texture | null): string | null {
  if (!texture) return null;
  const known = textureNames.get(texture);
  if (known) return known;
  const bytes = (texture.image as { sourcePNG: Buffer }).sourcePNG;
  if (!bytes) throw Error("An embedded texture lost its source bytes");
  const filename = `texture-${createHash("sha256").update(bytes).digest("hex")}.png`;
  textureNames.set(texture, filename);
  textureWrites.push(writeFile(`${out}/${filename}`, bytes));
  return filename;
}
for (const [name, head, weight, hat, glasses, emote] of [
  ["neutral", "head-scout", 0, null, null, null],
  ["lean-wave", "head-scout", -1, null, null, "wave"],
  ["broad-cheer", "head-spark", 1, null, null, "cheer"],
  ["fitted", "head-spark", 1, "hat-club-cap", "acc-glasses", null],
] as const) {
  const avatar = library.create();
  const recipe = defaultRecipe(catalog);
  Object.assign(recipe.parts, {
    head,
    hair: "hair-crane",
    face: "face-grin",
    headwear: hat,
    eyewear: glasses,
  });
  if (parts.some((part: { id: string }) => part.id === "shirt-circuit"))
    recipe.parts.shirt = "shirt-circuit";
  recipe.body = { weight };
  Object.assign(recipe.colors, {
    skin: "#cb9472",
    hair: "#486469",
    primary: "#dc6849",
    secondary: "#273646",
    trim: "#f1dfb8",
    accent: "#cad959",
  });
  await avatar.setAppearance(recipe);
  for (let frame = 0; frame <= 60; frame++)
    avatar.update(
      frame / 60,
      emote ? { emote: { id: emote, elapsed: frame / 60 } } : {},
    );
  avatar.object.updateMatrixWorld(true);
  const meshes: unknown[] = [];
  avatar.object.traverseVisible((mesh) => {
    if (!(mesh instanceof THREE.Mesh)) return;
    if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
    let owner: THREE.Object3D | null = mesh;
    while (owner && !owner.userData.assetId) owner = owner.parent;
    const g = mesh.geometry;
    const p = g.getAttribute("position"),
      c = g.getAttribute("color"),
      uv = g.getAttribute("uv");
    const materials = (
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    ) as THREE.MeshStandardMaterial[];
    const vertices = Array.from({ length: p.count }, (_, i) =>
      mesh
        .getVertexPosition(i, new THREE.Vector3())
        .applyMatrix4(mesh.matrixWorld)
        .toArray(),
    );
    meshes.push({
      name: mesh.name,
      asset: owner?.userData.assetId,
      vertices,
      index: g.index
        ? Array.from(g.index.array)
        : Array.from({ length: p.count }, (_, i) => i),
      colors: c
        ? Array.from({ length: c.count }, (_, i) => [
            c.getX(i),
            c.getY(i),
            c.getZ(i),
            c.itemSize > 3 ? c.getW(i) : 1,
          ])
        : null,
      uv: uv
        ? Array.from({ length: uv.count }, (_, i) => [uv.getX(i), uv.getY(i)])
        : null,
      groups: g.groups,
      materials: materials.map((m) => ({
        name: m.name,
        color: m.color.toArray(),
        opacity: m.opacity,
        transparent: m.transparent,
        map: !!m.map,
        mapFile: textureFile(m.map),
        projection: m.userData.expressionProjection,
        vertexColors: m.vertexColors,
      })),
    });
  });
  await writeFile(
    `${out}/${name}.json`,
    JSON.stringify({ name, recipe, diagnostics: avatar.diagnostics(), meshes }),
  );
  console.log(name, avatar.diagnostics());
  avatar.dispose();
}
await Promise.all(textureWrites);
library.dispose();
