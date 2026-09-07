import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { defaultRecipe } from "../src/core";
import "./helpers/node-image";

test("actual head silhouettes retain a projecting chin, tapered jaw and restrained nose", async () => {
  const catalog = JSON.parse(
    await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
  );
  const library = new AvatarLibrary(
    catalog,
    "https://assets.test/",
    async (input) =>
      new Response(
        await readFile(
          new URL(
            "../public" + new URL(String(input)).pathname,
            import.meta.url,
          ),
        ),
      ),
  );
  try {
    for (const head of catalog.assets.filter(
      (asset: { slot: string }) => asset.slot === "head",
    )) {
      const recipe = defaultRecipe(library.catalog);
      recipe.parts.head = head.id;
      const avatar = library.create();
      try {
        await avatar.setAppearance(recipe);
        avatar.object.updateMatrixWorld(true);
        const points: THREE.Vector3[] = [],
          skin: THREE.Vector3[] = [];
        avatar.object.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          let owner: THREE.Object3D | null = object;
          while (owner && !owner.userData.assetId) owner = owner.parent;
          const target =
            owner?.userData.assetId === head.id
              ? points
              : owner?.userData.assetId === catalog.base
                ? skin
                : undefined;
          if (!target) return;
          for (
            let index = 0;
            index < object.geometry.getAttribute("position").count;
            index++
          )
            target.push(
              object
                .getVertexPosition(index, new THREE.Vector3())
                .applyMatrix4(object.matrixWorld),
            );
        });
        const floor = Math.min(...points.map((p) => p.y));
        const chin = points.filter((p) => p.y < floor + 0.035);
        const neck = skin.filter(
          (p) =>
            p.y > floor - 0.1 && p.y < floor + 0.05 && Math.abs(p.x) < 0.09,
        );
        const nose = points.filter(
          (p) => p.y > floor + 0.14 && p.y < floor + 0.21,
        );
        const cheek = points.filter(
          (p) => p.y > floor + 0.04 && p.y < floor + 0.085,
        );
        const forehead = points.filter(
          (p) => p.y > floor + 0.25 && p.y < floor + 0.32,
        );
        assert.ok(
          chin.length &&
            neck.length &&
            nose.length &&
            cheek.length &&
            forehead.length,
        );
        const forward = (region: THREE.Vector3[]) =>
          Math.max(...region.map((p) => p.z));
        const width = (region: THREE.Vector3[]) =>
          Math.max(...region.map((p) => p.x)) -
          Math.min(...region.map((p) => p.x));
        // Broad silhouette criteria, independent of vertex topology. These stop
        // an oval profile from losing its chin again, or a fix from becoming a beak.
        assert.ok(
          forward(chin) - forward(neck) >= 0.065,
          `${head.id}: chin disappears into neck`,
        );
        assert.ok(
          forward(chin) >= forward(forehead) - 0.035,
          `${head.id}: receding jaw`,
        );
        assert.ok(
          width(cheek) > width(chin) * 1.2,
          `${head.id}: jaw needs an angular taper`,
        );
        const projection = forward(nose) - forward(chin);
        assert.ok(
          projection > 0.015 && projection < 0.065,
          `${head.id}: nose projection ${projection}`,
        );
      } finally {
        avatar.dispose();
      }
    }
  } finally {
    library.dispose();
  }
});
