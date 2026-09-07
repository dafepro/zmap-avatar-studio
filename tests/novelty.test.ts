import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary, defaultRecipe, type Catalog } from "../src";
import "./helpers/node-image";

const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("../public" + new URL(String(input)).pathname, import.meta.url),
    ),
  );
const noveltyIds = [
  "hat-quack-captain",
  "acc-starstruck",
  "effect-pocket-galaxy",
];

function owner(object: THREE.Object3D): string | undefined {
  let parent: THREE.Object3D | null = object;
  while (parent && !parent.userData.assetId) parent = parent.parent;
  return parent?.userData.assetId;
}

test("novelty originals retain their colors when the outfit palette changes", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    avatar = library.create();
  const recipe = defaultRecipe(catalog);
  Object.assign(recipe.parts, {
    headwear: noveltyIds[0],
    eyewear: noveltyIds[1],
    effect: noveltyIds[2],
  });
  const colors = () => {
    const result: Record<string, number[][]> = {};
    avatar.object.traverse((object) => {
      const id = owner(object);
      if (!(object instanceof THREE.Mesh) || !id || !noveltyIds.includes(id))
        return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      (result[id] ??= []).push(
        ...materials.map((material) =>
          (material as THREE.MeshStandardMaterial).color.toArray(),
        ),
      );
    });
    return result;
  };
  try {
    await avatar.setAppearance(recipe);
    const before = colors();
    assert.deepEqual(Object.keys(before).sort(), [...noveltyIds].sort());
    await avatar.setAppearance({
      ...recipe,
      colors: Object.fromEntries(
        catalog.channels.map((channel) => [channel, "#bf187b"]),
      ),
    });
    assert.deepEqual(
      colors(),
      before,
      "original duck, gold frames and miniatures must not inherit shirt/skin colors",
    );
  } finally {
    avatar.dispose();
    library.dispose();
  }
});

test("Pocket Galaxy uses bounded orbit motion, freezes for reduced motion, and leaves leg movement clear", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    avatar = library.create();
  const recipe = defaultRecipe(catalog);
  recipe.parts.effect = "effect-pocket-galaxy";
  recipe.body = { weight: 1 };
  try {
    await avatar.setAppearance(recipe);
    const points = (effect: boolean) => {
      avatar.object.updateMatrixWorld(true);
      const result: THREE.Vector3[] = [];
      avatar.object.traverseVisible((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const id = owner(object);
        if ((id === "effect-pocket-galaxy") !== effect) return;
        if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
        const position = object.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++)
          result.push(
            object
              .getVertexPosition(i, new THREE.Vector3())
              .applyMatrix4(object.matrixWorld),
          );
      });
      return result;
    };
    avatar.update(0, { gesture: "idle", reducedMotion: false });
    const start = points(true).map((point) => point.toArray());
    avatar.update(3, { gesture: "idle", reducedMotion: false });
    assert.notDeepEqual(
      points(true).map((point) => point.toArray()),
      start,
    );
    for (const time of [3, 30]) {
      avatar.update(time, { gesture: "idle", reducedMotion: true });
      assert.deepEqual(
        points(true).map((point) => point.toArray()),
        start,
      );
    }
    const effect = points(true),
      lowest = Math.min(...effect.map((point) => point.y)),
      highest = Math.max(...effect.map((point) => point.y));
    const inner = Math.min(
        ...effect.map((point) => Math.hypot(point.x, point.z)),
      ),
      outer = Math.max(...effect.map((point) => Math.hypot(point.x, point.z)));
    assert.ok(
      lowest > 0.15 && highest < 0.5 && outer < 1,
      "cosmetic orbit stays above the floor in its bounded ankle zone",
    );
    let maximumLegReach = 0;
    for (const shoes of catalog.assets.filter(
      (asset) => asset.slot === "shoes",
    ))
      for (const weight of [-1, 0, 1]) {
        await avatar.setAppearance({
          ...recipe,
          parts: { ...recipe.parts, shoes: shoes.id },
          body: { weight },
        });
        for (const gesture of ["idle", "walk", "run", "wave"] as const)
          for (const time of [0, 0.2, 0.45, 0.7, 1.05]) {
            avatar.update(time, { gesture, reducedMotion: false });
            for (const point of points(false))
              if (point.y >= lowest - 0.015 && point.y <= highest + 0.015)
                maximumLegReach = Math.max(
                  maximumLegReach,
                  Math.hypot(point.x, point.z),
                );
          }
      }
    assert.ok(
      maximumLegReach + 0.015 < inner,
      `moving legs reach ${maximumLegReach.toFixed(3)} m; orbit begins at ${inner.toFixed(3)} m`,
    );
  } finally {
    avatar.dispose();
    library.dispose();
  }
});
