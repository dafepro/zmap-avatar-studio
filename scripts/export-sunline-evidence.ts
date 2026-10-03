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
const catalog: Catalog = JSON.parse(
  await readFile(new URL("public/capsule/catalog.json", root), "utf8"),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("public/capsule" + new URL(String(input)).pathname, root),
    ),
  );
const library = new AvatarLibrary(catalog, "https://sunline.test/", fetcher);
const out = process.argv[2] || "/tmp/sunline-runtime";
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
for (const [name, head, weight, motion] of [
  ["neutral", "head-scout", 0, "idle"],
  ["lean-wave", "head-scout", -1, "wave"],
  ["broad-run", "head-spark", 1, "run"],
  ["deep-run", "head-spark", 1, "deep-run"],
  ["broad-wave", "head-spark", 1, "wave"],
  ["broad-neutral", "head-spark", 1, "idle"],
] as const) {
  const avatar = library.create();
  const recipe = defaultRecipe(catalog);
  Object.assign(recipe.parts, {
    head,
    hair: "hair-sweep",
    face: "face-grin",
    headwear: "hat-sunline-visor",
    shirt: "shirt-sunline-courier",
    bottom: "bottom-sunline-cargo",
    shoes: "shoes-sunline-track",
    accessory: "acc-sunline-envelope",
  });
  recipe.body = { weight };
  Object.assign(recipe.colors, {
    skin: "#cb9472",
    hair: "#303643",
    primary: "#e97552",
    secondary: "#303643",
    trim: "#f4e8cf",
    accent: "#d4e951",
  });
  await avatar.setAppearance(recipe);
  for (let frame = 0; frame <= (motion === "deep-run" ? 30 : 60); frame++)
    avatar.update(
      frame / 60,
      motion === "wave"
        ? { emote: { id: "wave", elapsed: frame / 60 } }
        : motion === "run" || motion === "deep-run"
          ? { velocity: { x: 0, z: 3.8 }, grounded: true }
          : {},
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
