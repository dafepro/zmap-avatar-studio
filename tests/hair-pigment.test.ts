import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary, ComicStyle, defaultRecipe, type Catalog } from "../src";
import "./helpers/node-image";
const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
test("undercut pigment follows hair color independently of clothes and accessory colors", async () => {
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
    ),
    avatar = library.create();
  try {
    const recipe = defaultRecipe(catalog);
    recipe.parts.hair = "hair-volt";
    recipe.colors.hair = "#b59b76";
    const snapshot = () => {
      const data: { colors: number[]; pigment: number[] }[] = [];
      avatar.object.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.comicOutline) return;
        let parent: THREE.Object3D | null = o;
        while (parent && !parent.userData.assetId) parent = parent.parent;
        if (parent?.userData.assetId !== "hair-volt") return;
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials)
          assert.ok(m.vertexColors, "pigment survives both display modes");
        data.push({
          colors: materials.flatMap((m) =>
            (m as THREE.MeshStandardMaterial).color.toArray(),
          ),
          pigment: Array.from(
            { length: o.geometry.getAttribute("color").count },
            (_, i) => {
              const a = o.geometry.getAttribute("color");
              return Array.from({ length: a.itemSize }, (_, j) =>
                a.getComponent(i, j),
              );
            },
          ).flat(),
        });
      });
      return data;
    };
    await avatar.setAppearance(recipe);
    const original = snapshot();
    assert.ok(original.length);
    const pigment = original.flatMap((x) => x.pigment);
    assert.ok(
      Math.min(...pigment) < 0.2 && Math.max(...pigment) === 1,
      "authored dark roots and undyed lengths",
    );
    for (const secondary of ["#ff0033", "#ffffff", "#102aef"]) {
      await avatar.setAppearance({
        ...recipe,
        colors: { ...recipe.colors, secondary },
      });
      assert.deepEqual(
        snapshot(),
        original,
        "clothes and glasses colors cannot recolor hair roots",
      );
    }
    const ink = new ComicStyle();
    try {
      ink.update(avatar.object.children[0], new THREE.Vector2(800, 600));
      assert.deepEqual(snapshot(), original);
    } finally {
      ink.clear();
    }
    await avatar.setAppearance({
      ...recipe,
      colors: { ...recipe.colors, hair: "#954522" },
    });
    const changed = snapshot();
    assert.notDeepEqual(
      changed.map((x) => x.colors),
      original.map((x) => x.colors),
    );
    assert.deepEqual(
      changed.map((x) => x.pigment),
      original.map((x) => x.pigment),
    );
  } finally {
    avatar.dispose();
    library.dispose();
  }
});
