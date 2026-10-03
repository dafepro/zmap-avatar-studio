import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  validateRecipe,
  type Catalog,
  type Recipe,
} from "../src";
import { validateLook } from "../app/atelier-state";
import "./helpers/node-image";
import {
  captureRestAnatomy,
  measureTrouserClearance,
} from "./helpers/tideglass-trouser-clearance";
const root = new URL("../", import.meta.url);
const catalog: Catalog = JSON.parse(
  await readFile(new URL("public/capsule/catalog.json", root), "utf8"),
);
const manifest = JSON.parse(
  await readFile(
    new URL("public/capsule/sets/tideglass-explorer.json", root),
    "utf8",
  ),
);
const look = JSON.parse(
  await readFile(
    new URL(
      manifest.look,
      new URL("public/capsule/sets/tideglass-explorer.json", root),
    ),
    "utf8",
  ),
);
const wield = JSON.parse(
  await readFile(new URL("public/wield/catalog.json", root), "utf8"),
);
const ids: string[] = manifest.components.map((c: { id: string }) => c.id);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL(
        "public/capsule/" + new URL(String(input)).pathname.slice(1),
        root,
      ),
    ),
  );
const createLibrary = () =>
  new AvatarLibrary(catalog, "https://tideglass.test/", fetcher);
function meshes(root: THREE.Object3D, id: string, role?: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let p: THREE.Object3D | null = o;
    while (p && !p.userData.assetId) p = p.parent;
    if (
      p?.userData.assetId === id &&
      (!role ||
        o.userData.fitRole === role ||
        o.parent?.userData.fitRole === role)
    )
      found.push(o);
  });
  return found;
}
function points(mesh: THREE.Mesh) {
  if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
  return Array.from(
    { length: mesh.geometry.attributes.position.count },
    (_, i) =>
      mesh
        .getVertexPosition(i, new THREE.Vector3())
        .applyMatrix4(mesh.matrixWorld),
  );
}
function bake(source: THREE.Mesh[]) {
  return source.map((m) => {
    const g = m.geometry.clone();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        points(m).flatMap((p) => p.toArray()),
        3,
      ),
    );
    g.computeBoundingSphere();
    const result = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    result.name = m.name;
    result.userData = m.userData;
    result.updateMatrixWorld();
    return result;
  });
}
function crossings(source: THREE.Mesh[], target: THREE.Mesh[]) {
  let count = 0;
  for (const mesh of source) {
    const p = points(mesh),
      ix = mesh.geometry.index;
    for (let i = 0; i < (ix?.count ?? p.length); i += 3)
      for (let j = 0; j < 3; j++) {
        const a = p[ix?.getX(i + j) ?? i + j],
          b = p[ix?.getX(i + ((j + 1) % 3)) ?? i + ((j + 1) % 3)],
          d = b.clone().sub(a),
          len = d.length();
        if (len < 0.0004) continue;
        if (
          new THREE.Raycaster(
            a,
            d.normalize(),
            0.0002,
            len - 0.0002,
          ).intersectObjects(target, false).length
        )
          count++;
      }
  }
  return count;
}
function rest(avatar: ReturnType<AvatarLibrary["create"]>) {
  const view = avatar.attachmentView()!;
  for (const b of view.sockets.values()) b.quaternion.identity();
  view.root.position.set(0, 0, 0);
  avatar.object.updateMatrixWorld(true);
}
function disposeMeshes(source: THREE.Mesh[]) {
  for (const mesh of source) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}

test("Tideglass manifest names exactly five independently owned components and imports as a complete SHIFT look", () => {
  assert.equal(manifest.format, "shift-collectible-set");
  assert.equal(manifest.version, 1);
  assert.equal(manifest.id, "tideglass-explorer");
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(
    manifest.components.map((c: { slot: string }) => c.slot).sort(),
    ["accessory", "bottom", "headwear", "shirt", "shoes"],
  );
  assert.deepEqual(manifest.palette, {
    primary: "#277f8d",
    secondary: "#203e50",
    trim: "#afe4ee",
    accent: "#ed9551",
  });
  validateLook(look, catalog, wield);
  validateRecipe(look.appearance, catalog);
  for (const c of manifest.components) {
    assert.equal(look.appearance.parts[c.slot], c.id);
    const part = catalog.assets.find((a) => a.id === c.id)!;
    assert.equal(part.slot, c.slot);
    assert.equal(part.rig, "athlete-reference-v2");
  }
  const complete = (owned: Set<string>) => ids.every((id) => owned.has(id));
  assert.ok(complete(new Set(ids)));
  for (const missing of ids)
    assert.equal(complete(new Set(ids.filter((id) => id !== missing))), false);
  assert.ok(
    ids.reduce(
      (sum, id) => sum + catalog.assets.find((a) => a.id === id)!.triangles,
      0,
    ) <= 2600,
  );
});

test("Tideglass individual swaps preserve unrelated selections; full optional stacks fit both heads and all weights", async () => {
  const lib = createLibrary();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const avatar = lib.create();
        try {
          const base = defaultRecipe(catalog);
          base.parts.head = head;
          base.body = { weight };
          for (const c of manifest.components) {
            const recipe = structuredClone(base);
            recipe.parts[c.slot as keyof Recipe["parts"]] = c.id;
            await avatar.setAppearance(recipe);
            assert.deepEqual(avatar.recipe, recipe);
          }
          for (const hair of catalog.assets.filter((a) => a.slot === "hair")) {
            const recipe = structuredClone(look.appearance);
            Object.assign(recipe.parts, {
              head,
              hair: hair.id,
              facialHair: "facial-mustache",
              eyewear: "acc-glasses",
              effect: "effect-orbit",
            });
            recipe.body = { weight };
            await avatar.setAppearance(recipe);
            const diag = avatar.diagnostics();
            assert.ok(diag.sourceTriangles <= 14000);
            assert.equal(diag.parts, 12);
            const bytes = [
              catalog.base,
              ...Object.values(recipe.parts).filter(Boolean),
            ].reduce<number>(
              (n, id) => n + catalog.assets.find((a) => a.id === id)!.bytes,
              0,
            );
            assert.ok(bytes <= 1500000);
            avatar.object.traverse((o) => {
              if (!(o instanceof THREE.SkinnedMesh)) return;
              const w = o.geometry.attributes.skinWeight;
              for (let i = 0; i < w.count; i++) {
                const total = [0, 1, 2, 3].reduce(
                  (n, j) => n + w.getComponent(i, j),
                  0,
                );
                assert.ok(
                  Number.isFinite(total) && Math.abs(total - 1) < 0.002,
                );
              }
            });
          }
        } finally {
          avatar.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});

test("Tideglass ankle fabric and long trousers retain correct leg ownership", async () => {
  const lib = createLibrary();
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        const recipe = structuredClone(look.appearance);
        recipe.body = { weight };
        await a.setAppearance(recipe);
        rest(a);
        let upperSock = 0,
          blended = 0,
          lowerPant = 0;
        for (const m of meshes(
          a.object,
          "shoes-tideglass-reef",
        ) as THREE.SkinnedMesh[]) {
          const ps = points(m),
            w = m.geometry.attributes.skinWeight,
            ix = m.geometry.attributes.skinIndex;
          for (let i = 0; i < ps.length; i++) {
            let shin = 0,
              foot = 0;
            for (let j = 0; j < 4; j++) {
              const value = w.getComponent(i, j);
              if (!value) continue;
              const bone = m.skeleton.bones[ix.getComponent(i, j)].name;
              assert.ok(/^(shin|foot)_[LR]$/.test(bone));
              if (bone.startsWith("shin")) shin += value;
              else foot += value;
            }
            if (ps[i].y > 0.3) {
              assert.ok(shin > 0.999);
              upperSock++;
            }
            if (foot > 0.05 && shin > 0.05) blended++;
            if (m.userData.fitRole === "rigid-boot") assert.ok(ps[i].y <= 0.26);
          }
        }
        for (const m of meshes(
          a.object,
          "bottom-tideglass-tech",
        ) as THREE.SkinnedMesh[]) {
          const ps = points(m),
            w = m.geometry.attributes.skinWeight,
            ix = m.geometry.attributes.skinIndex;
          for (let i = 0; i < ps.length; i++) {
            assert.ok(ps[i].y >= 0.28);
            if (ps[i].y < 0.45) {
              let shin = 0;
              for (let j = 0; j < 4; j++)
                if (
                  m.skeleton.bones[ix.getComponent(i, j)].name.startsWith(
                    "shin",
                  )
                )
                  shin += w.getComponent(i, j);
              assert.ok(shin > 0.999);
              lowerPant++;
            }
          }
        }
        assert.ok(upperSock > 30 && blended > 10 && lowerPant > 30);
      } finally {
        a.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
});

test("Tideglass actual leg anatomy stays under the technical trousers at both heads and all weights", async () => {
  const lib = createLibrary();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const a = lib.create();
        try {
          const recipe = structuredClone(look.appearance);
          recipe.parts.head = head;
          recipe.body = { weight };
          await a.setAppearance(recipe);
          rest(a);
          const body = bake(meshes(a.object, "body-athletic")),
            pants = bake(meshes(a.object, "bottom-tideglass-tech"));
          let tested = 0;
          const failures: string[] = [];
          for (const y of [0.335, 0.37, 0.41, 0.46, 0.52, 0.59, 0.65, 0.72])
            for (const sign of [-1, 1])
              for (let angle = 0; angle < 360; angle += 20) {
                const centerX = sign * (0.11 + ((0.99 - y) / 0.87) * 0.115);
                const rad = (angle * Math.PI) / 180;
                const d = new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad));
                const origin = new THREE.Vector3(centerX, y, 0).addScaledVector(
                  d,
                  0.16,
                );
                const ray = new THREE.Raycaster(origin, d.negate(), 0, 0.32);
                const skin = ray.intersectObjects(body, false)[0];
                if (!skin) continue;
                tested++;
                const cover = ray.intersectObjects(pants, false)[0];
                if (!cover || cover.distance > skin.distance - 0.0005)
                  failures.push(
                    `${y}/${sign}/${angle}: ${cover ? 1000 * (skin.distance - cover.distance) : "missing"}`,
                  );
              }
          assert.ok(tested > 150);
          disposeMeshes(body);
          disposeMeshes(pants);
          assert.equal(
            failures.length,
            0,
            `${head}/${weight}: ${failures.length} protrusion samples: ${failures.slice(0, 12)}`,
          );
        } finally {
          a.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});

test("Tideglass exposed shell faces remain outside cloth through run and wave; closed mounting backs meet the cloth", async () => {
  const lib = createLibrary();
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        const recipe = structuredClone(look.appearance);
        recipe.body = { weight };
        await a.setAppearance(recipe);
        for (const pose of ["rest", "run", "wave"] as const)
          for (const time of [0.2, 0.55, 1.0]) {
            if (pose === "rest") rest(a);
            else {
              for (let i = 0; i <= 60; i++)
                a.update(
                  time + i / 60,
                  pose === "run"
                    ? { velocity: { x: 0, z: 5.4 } }
                    : { emote: { id: "wave", elapsed: time + i / 60 } },
                );
              a.object.updateMatrixWorld(true);
            }
            for (const [id, roles] of [
              ["shirt-tideglass-shell", ["chest-shell", "back-shell"]],
              ["bottom-tideglass-tech", ["panel-front"]],
            ] as const) {
              const cloth = bake(meshes(a.object, id, "cloth")),
                panels = bake(
                  roles.flatMap((role) => meshes(a.object, id, role)),
                );
              assert.ok(cloth.length && panels.length);
              const count = crossings(panels, cloth) + crossings(cloth, panels);
              disposeMeshes(cloth);
              disposeMeshes(panels);
              assert.equal(
                count,
                0,
                `${id}/${weight}/${pose}/${time}: panel/cloth crossings`,
              );
            }
          }
      } finally {
        a.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
});

test("Tideglass run and wave preserve finite geometry, fixed rig and actual shoe floor contact", async () => {
  const lib = createLibrary();
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        const recipe = structuredClone(look.appearance);
        recipe.body = { weight };
        await a.setAppearance(recipe);
        const view = a.attachmentView()!;
        const restBones = [...view.sockets.values()].map((b) => ({
          b,
          p: b.position.clone(),
          s: b.scale.clone(),
        }));
        let contactFrames = 0;
        for (const pose of ["run", "wave"] as const)
          for (let i = 0; i < 180; i++) {
            a.update(
              i / 60,
              pose === "run"
                ? { velocity: { x: 0, z: 5.4 } }
                : { emote: { id: "wave", elapsed: i / 60 } },
            );
            a.object.updateMatrixWorld(true);
            for (const { b, p, s } of restBones)
              if (b.name !== "root") {
                assert.ok(b.position.distanceTo(p) < 1e-6);
                assert.ok(b.scale.distanceTo(s) < 1e-6);
              }
            let floor = Infinity;
            for (const m of meshes(a.object, "shoes-tideglass-reef"))
              for (const p of points(m)) {
                assert.ok(p.toArray().every(Number.isFinite));
                floor = Math.min(floor, p.y);
              }
            assert.ok(
              floor >= -0.012,
              `${pose}/${weight}/${i}: floor ${floor}`,
            );
            if (floor < 0.012) contactFrames++;
          }
        assert.ok(contactFrames > 100);
      } finally {
        a.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
});

test("Tideglass deep-knee samples distinguish hidden internal folds from exterior skin leaks", async () => {
  const lib = createLibrary(),
    records = [];
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        const recipe = structuredClone(look.appearance);
        recipe.body = { weight };
        await a.setAppearance(recipe);
        const source = captureRestAnatomy(a.object);
        for (const time of [0.05, 0.18, 0.3, 0.45, 0.62]) {
          a.update(time, { velocity: { x: 0, z: 5.4 } });
          const measurement = measureTrouserClearance(
            a.object,
            "bottom-tideglass-tech",
            source,
          );
          assert.ok(
            measurement.visibleSamples > 1000,
            "Exterior sampler must examine visible anatomy",
          );
          assert.equal(
            measurement.cuffApertures.length,
            2,
            "Both actual ankle openings must be found",
          );
          assert.ok(
            measurement.cuffApertures.every(
              (cuff) => cuff.vertices >= 8 && cuff.center[1] < 0.35,
            ),
          );
          assert.equal(
            measurement.exposedSamples.length,
            0,
            JSON.stringify({ weight, time, ...measurement }),
          );
          records.push({ weight, time, ...measurement });
        }
      } finally {
        a.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
  await mkdir(new URL("docs/evidence/tideglass/", root), { recursive: true });
  await writeFile(
    new URL("docs/evidence/tideglass/clearance-diagnostics.json", root),
    JSON.stringify(
      {
        note: "All-anatomy crossings include masked thighs and hidden concave folds. Exterior visibility excludes hidden ancestors and rays entering true cuff apertures; zero exterior leaks is a sampled result, not collision-free cloth simulation.",
        parts: catalog.assets
          .filter((p) => ids.includes(p.id))
          .map((p) => ({
            id: p.id,
            sha256: p.sha256,
            triangles: p.triangles,
            bytes: p.bytes,
          })),
        records,
      },
      null,
      2,
    ) + "\n",
  );
});

test("Tideglass open crown clears both actual head surfaces at every weight", async () => {
  const lib = createLibrary();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const a = lib.create();
        try {
          const recipe = structuredClone(look.appearance);
          recipe.parts.head = head;
          recipe.body = { weight };
          await a.setAppearance(recipe);
          rest(a);
          const hat = bake(meshes(a.object, "hat-tideglass-fin")),
            skin = bake(meshes(a.object, head));
          assert.equal(
            crossings(hat, skin) + crossings(skin, hat),
            0,
            `${head}/${weight}: headwear crossing`,
          );
          disposeMeshes(hat);
          disposeMeshes(skin);
        } finally {
          a.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});
