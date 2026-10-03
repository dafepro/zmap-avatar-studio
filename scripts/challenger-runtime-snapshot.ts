/** Bake the actual loaded/fitted runtime meshes to review-only JSON for Blender. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary, defaultRecipe, type Catalog, type Asset } from "../src";
import "../tests/helpers/node-image";
const catalog: Catalog = JSON.parse(
  await readFile("public/catalog.json", "utf8"),
);
const descriptor: Asset = JSON.parse(
  await readFile("public/capsule/parts/face-challenger.json", "utf8"),
);
catalog.assets.push(descriptor);
const library = new AvatarLibrary(
  catalog,
  "https://assets.test/",
  async (input) => {
    const pathname = new URL(String(input)).pathname;
    return new Response(
      await readFile(
        "public" +
          (pathname.endsWith("/face-challenger.glb") ? "/capsule" : "") +
          pathname,
      ),
    );
  },
);
const out = "outputs/challenger";
await mkdir(out, { recursive: true });
const samples = [];
try {
  for (const head of ["head-scout", "head-spark"])
    for (const pose of ["idle", "run", "wave"] as const) {
      const avatar = library.create(),
        recipe = defaultRecipe(catalog);
      Object.assign(recipe.parts, {
        head,
        face: descriptor.id,
        hair: pose === "idle" ? null : "hair-ember",
        shirt: "shirt-volt",
        shoes: "shoes-high",
      });
      Object.assign(recipe.colors, {
        skin: head === "head-scout" ? "#bf8357" : "#d7a77f",
        primary: "#cf5739",
        secondary: "#282c3a",
        trim: "#fff1d1",
        hair: "#363130",
        accent: "#f2c44c",
      });
      try {
        await avatar.setAppearance(recipe);
        for (const t of [0, 0.5, 1, 1.125]) avatar.update(t, { gesture: pose });
        avatar.object.updateMatrixWorld(true);
        const meshes: unknown[] = [];
        avatar.object.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          let p: THREE.Object3D | null = o;
          while (p) {
            if (!p.visible) return;
            p = p.parent;
          }
          p = o;
          while (p && !p.userData.assetId) p = p.parent;
          const assetId = p?.userData.assetId;
          const geometry = o.geometry,
            positions = geometry.getAttribute("position"),
            uv = geometry.getAttribute("uv"),
            color = geometry.getAttribute("color");
          const materials = (
            Array.isArray(o.material) ? o.material : [o.material]
          ).map((material) => {
            const m = material as THREE.MeshStandardMaterial;
            return {
              name: m.name,
              color: m.color.toArray(),
              opacity: m.opacity,
              projection: m.userData.expressionProjection ?? null,
              texture: assetId === descriptor.id,
              vertexColors: m.vertexColors,
            };
          });
          meshes.push({
            name: o.name,
            assetId,
            positions: Array.from({ length: positions.count }, (_, i) =>
              o
                .getVertexPosition(i, new THREE.Vector3())
                .applyMatrix4(o.matrixWorld)
                .toArray(),
            ),
            indices: geometry.index
              ? Array.from(geometry.index.array)
              : Array.from({ length: positions.count }, (_, i) => i),
            uv: uv
              ? Array.from({ length: uv.count }, (_, i) => [
                  uv.getX(i),
                  uv.getY(i),
                ])
              : null,
            colors: color
              ? Array.from({ length: color.count }, (_, i) => [
                  color.getX(i),
                  color.getY(i),
                  color.getZ(i),
                ])
              : null,
            groups: geometry.groups,
            materials,
          });
        });
        const name = `runtime-${head}-${pose}`;
        await writeFile(
          `${out}/${name}.json`,
          JSON.stringify({
            name,
            recipe,
            diagnostics: avatar.diagnostics(),
            meshes,
          }),
        );
        samples.push({ name, recipe, diagnostics: avatar.diagnostics() });
      } finally {
        avatar.dispose();
      }
    }
} finally {
  library.dispose();
}
await writeFile(
  "docs/evidence/challenger/runtime-validation.json",
  JSON.stringify(
    {
      source:
        "Actual AvatarLibrary GLB load, surface fitting, and posed world-space vertex samples; review mesh data is not a replacement asset",
      samples,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    samples.map((s) => ({ name: s.name, ...s.diagnostics })),
    null,
    2,
  ),
);
