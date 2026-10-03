import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import {
  defaultRecipe,
  inspectGlb,
  validateCatalog,
  validateRecipe,
  type Catalog,
} from "../src/core";
import { parseLook } from "../app/atelier-state";
import "./helpers/node-image";
import {
  captureRestAnatomy,
  measureTrouserClearance,
} from "./helpers/moonwake-trouser-clearance";
const root = new URL("../", import.meta.url);
const read = async (path: string) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const catalog: Catalog = await read("public/capsule/catalog.json");
const base: Catalog = await read("public/catalog.json");
const set = await read("public/capsule/sets/moonwake-festival.json");
const look = await read("public/capsule/looks/moonwake-festival.shift.json");
const ids = new Set<string>(set.components.map((p: { id: string }) => p.id));
const library = () =>
  new AvatarLibrary(
    catalog,
    "https://moonwake.test/",
    async (input) =>
      new Response(
        await readFile(
          new URL(`public/capsule${new URL(String(input)).pathname}`, root),
        ),
      ),
  );
function owner(o: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p && !p.userData.assetId) p = p.parent;
  return p?.userData.assetId;
}
function meshes(avatar: ReturnType<AvatarLibrary["create"]>, id: string) {
  const result: THREE.Mesh[] = [];
  avatar.object.traverse((o) => {
    if (o instanceof THREE.Mesh && owner(o) === id && !o.userData.comicOutline)
      result.push(o);
  });
  return result;
}
function points(mesh: THREE.Mesh) {
  if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
  return Array.from(
    { length: mesh.geometry.getAttribute("position").count },
    (_, i) =>
      mesh
        .getVertexPosition(i, new THREE.Vector3())
        .applyMatrix4(mesh.matrixWorld),
  );
}
function reset(avatar: ReturnType<AvatarLibrary["create"]>) {
  const view = avatar.attachmentView()!;
  for (const s of view.sockets.values()) s.quaternion.identity();
  view.root.position.set(0, 0, 0);
  avatar.object.updateMatrixWorld(true);
}

test("Moonwake is an explicit five-piece collection with an importable full-look recipe and host-side completion", async () => {
  assert.equal(set.format, "shift-collectible-set");
  assert.equal(set.version, 1);
  assert.equal(set.id, "moonwake-festival");
  assert.equal(ids.size, 5);
  assert.deepEqual(
    new Set(set.components.map((p: { slot: string }) => p.slot)),
    new Set(["headwear", "shirt", "bottom", "shoes", "accessory"]),
  );
  const complete = (owned: Set<string>) =>
    set.components.every((p: { id: string }) => owned.has(p.id));
  assert.equal(complete(new Set()), false);
  assert.equal(complete(ids), true);
  for (const missing of ids)
    assert.equal(
      complete(new Set([...ids].filter((id) => id !== missing))),
      false,
    );
  assert.equal(complete(new Set([...ids, "unrelated-owned-piece"])), true);
  const imported = parseLook(
    JSON.stringify(look),
    catalog,
    await read("public/wield/catalog.json"),
  );
  for (const p of set.components)
    assert.equal(imported.appearance.parts[p.slot], p.id);
  assert.deepEqual(catalog.budgets, base.budgets);
  assert.deepEqual(catalog.rig, base.rig);
  assert.deepEqual(catalog.channels, base.channels);
  for (const [channel, color] of Object.entries(set.palette))
    assert.equal(imported.appearance.colors[channel], color);
  validateCatalog(catalog);
  let triangles = 0;
  for (const id of ids) {
    const record = catalog.assets.find((a) => a.id === id)!;
    const bytes = await readFile(new URL(`public/capsule/${record.url}`, root));
    assert.equal(record.bytes, bytes.length);
    assert.equal(
      record.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    inspectGlb(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      record,
    );
    triangles += record.triangles;
  }
  assert.ok(triangles <= 2600, `Set is ${triangles} triangles`);
});

test("each Moonwake component independently fits legacy pieces at both heads and three builds; full set accepts all optional categories", async () => {
  const lib = library();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        for (const part of set.components) {
          const a = lib.create();
          try {
            const recipe = defaultRecipe(catalog);
            recipe.parts.head = head;
            recipe.body = { weight };
            recipe.parts[part.slot] = part.id;
            const before = structuredClone(recipe);
            await a.setAppearance(recipe);
            assert.deepEqual(recipe, before);
            assert.ok(meshes(a, part.id).length);
            a.update(0.4, { emote: { id: "wave", elapsed: 0.4 } });
            assert.ok(
              meshes(a, part.id)
                .flatMap(points)
                .every((p) => p.toArray().every(Number.isFinite)),
            );
          } finally {
            a.dispose();
          }
        }
        const a = lib.create();
        try {
          const recipe = structuredClone(look.appearance);
          recipe.parts.head = head;
          recipe.body = { weight };
          for (const slot of [
            "hair",
            "face",
            "facialHair",
            "eyewear",
            "effect",
          ]) {
            const options = catalog.assets
              .filter((a) => a.slot === slot)
              .sort((a, b) => b.triangles - a.triangles);
            recipe.parts[slot] = options[0]?.id ?? null;
          }
          validateRecipe(recipe, catalog);
          await a.setAppearance(recipe);
          assert.ok(a.diagnostics().sourceTriangles <= 14000);
          assert.equal(a.diagnostics().parts, 12);
        } finally {
          a.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});

test("Moonwake skins have finite normalized anatomical ownership, calf-following cuffs and unchanged rest rig", async () => {
  const lib = library();
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        const recipe = structuredClone(look.appearance);
        recipe.body = { weight };
        await a.setAppearance(recipe);
        reset(a);
        const view = a.attachmentView()!;
        for (const socket of catalog.rig.sockets) {
          const bone = view.sockets.get(socket.id)!;
          assert.deepEqual(bone.position.toArray(), socket.position);
          assert.deepEqual(bone.scale.toArray(), [1, 1, 1]);
        }
        let calfVertices = 0,
          soleVertices = 0;
        for (const id of ids)
          for (const m of meshes(a, id)) {
            if (!(m instanceof THREE.SkinnedMesh)) continue;
            const indices = m.geometry.getAttribute("skinIndex"),
              weights = m.geometry.getAttribute("skinWeight"),
              rest = points(m);
            for (let i = 0; i < indices.count; i++) {
              let sum = 0;
              const influences: Record<string, number> = {};
              for (let j = 0; j < 4; j++) {
                const w = weights.getComponent(i, j);
                assert.ok(Number.isFinite(w) && w >= 0 && w <= 1);
                sum += w;
                if (w)
                  influences[
                    m.skeleton.bones[indices.getComponent(i, j)].name
                  ] = w;
              }
              assert.ok(Math.abs(sum - 1) < 0.002);
              const p = rest[i],
                side = p.x < 0 ? "L" : "R";
              if (id === "bottom-moonwake-wide" && p.y < 0.48) {
                assert.ok(
                  (influences[`shin_${side}`] ?? 0) > 0.999,
                  "cropped cuffs must follow the shin",
                );
                assert.equal(influences[`foot_${side}`] ?? 0, 0);
                calfVertices++;
              }
              if (id === "shoes-moonwake-platform" && p.y < 0.06) {
                assert.ok(
                  (influences[`foot_${side}`] ?? 0) > 0.999,
                  "platform soles must follow the foot",
                );
                soleVertices++;
              }
              if (id === "shoes-moonwake-platform" && p.y > 0.32)
                assert.ok(
                  (influences[`shin_${side}`] ?? 0) > 0.999,
                  "sock bridges the feet coverage mask on the shin",
                );
            }
          }
        assert.ok(calfVertices > 40 && soleVertices > 40);
      } finally {
        a.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
});

test("Moonwake actual geometry stays finite, continuous and floor supported through run and wave; balloon trousers cover calves", async () => {
  const lib = library();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const a = lib.create();
        try {
          const recipe = structuredClone(look.appearance);
          recipe.parts.head = head;
          recipe.body = { weight };
          await a.setAppearance(recipe);
          reset(a);
          const clothing = [...ids].flatMap((id) => meshes(a, id));
          const rest = new Map(clothing.map((m) => [m, points(m)]));
          const body = meshes(a, "body-athletic").filter((m) => m.visible);
          const bodyRest = new Map(body.map((m) => [m, points(m)]));
          const joints = a.attachmentView()!.sockets;
          const originalPositions = new Map(
            [...joints].map(([name, b]) => [name, b.position.clone()]),
          );
          for (const pose of ["rest", "run", "wave"] as const)
            for (const t of pose === "rest"
              ? [0]
              : [0.18, 0.36, 0.54, 0.72, 0.9, 1.08]) {
              if (pose === "rest") reset(a);
              else {
                for (let frame = 0; frame <= Math.round(t * 60); frame++)
                  a.update(
                    frame / 60,
                    pose === "run"
                      ? { gesture: "run" }
                      : { emote: { id: "wave", elapsed: frame / 60 } },
                  );
                a.object.updateMatrixWorld(true);
              }
              for (const [name, b] of joints) {
                assert.ok(
                  b.position.distanceTo(originalPositions.get(name)!) < 1e-10,
                );
                assert.deepEqual(b.scale.toArray(), [1, 1, 1]);
              }
              for (const m of clothing) {
                const p = points(m);
                assert.ok(
                  p.every(
                    (v) => v.toArray().every(Number.isFinite) && v.length() < 3,
                  ),
                );
                const idx = m.geometry.index,
                  r = rest.get(m)!;
                for (let i = 0; i < (idx?.count ?? p.length); i += 3)
                  for (let j = 0; j < 3; j++) {
                    const x = idx?.getX(i + j) ?? i + j,
                      y = idx?.getX(i + ((j + 1) % 3)) ?? i + ((j + 1) % 3);
                    assert.ok(
                      p[x].distanceTo(p[y]) <= r[x].distanceTo(r[y]) * 3 + 0.02,
                      `${head}/${weight}/${pose} stretched edge in ${owner(m)}`,
                    );
                  }
              }
              const minFoot = Math.min(
                ...meshes(a, "shoes-moonwake-platform")
                  .flatMap(points)
                  .map((p) => p.y),
              );
              assert.ok(
                minFoot >= -0.006,
                `${head}/${weight}/${pose}/${t} floor penetration ${minFoot}`,
              );
              // Rays from visible calf surface radially inward meet the actual posed pant.
              // No mask or hidden calf proxy is used to make this pass.
              const shell = meshes(a, "bottom-moonwake-wide").flatMap((m) => {
                const p = points(m),
                  idx = m.geometry.index,
                  r = rest.get(m)!;
                return Array.from(
                  { length: (idx?.count ?? p.length) / 3 },
                  (_, i) => {
                    const indexes = [0, 1, 2].map(
                      (j) => idx?.getX(i * 3 + j) ?? i * 3 + j,
                    );
                    return {
                      side:
                        indexes.reduce((n, j) => n + r[j].x, 0) < 0 ? "L" : "R",
                      vertices: indexes.map((j) => p[j]),
                    };
                  },
                );
              });
              let checked = 0;
              for (const m of body)
                for (const [i, p] of points(m).entries()) {
                  const p0 = bodyRest.get(m)![i];
                  if (p0.y < 0.397 || p0.y > 0.49 || Math.abs(p0.x) < 0.08)
                    continue;
                  const side = p0.x < 0 ? "L" : "R";
                  const hip = joints
                      .get(`leg_${side}`)!
                      .getWorldPosition(new THREE.Vector3()),
                    knee = joints
                      .get(`shin_${side}`)!
                      .getWorldPosition(new THREE.Vector3()),
                    foot = joints
                      .get(`foot_${side}`)!
                      .getWorldPosition(new THREE.Vector3());
                  // A deep knee bend overlaps the balloon volume with itself, so parity
                  // incorrectly treats covered points as outside. Test actual visibility:
                  // each viewing direction must meet same-leg cloth before exposed skin.
                  // Samples deliberately exclude the garment's open hems and waist.
                  let covered = 0;
                  const blend = THREE.MathUtils.smoothstep(p0.y, 0.49, 0.64);
                  const axis = foot
                    .clone()
                    .sub(knee)
                    .normalize()
                    .lerp(knee.clone().sub(hip).normalize(), blend)
                    .normalize();
                  const u = new THREE.Vector3(1, 0, 0)
                      .addScaledVector(axis, -axis.x)
                      .normalize(),
                    v = new THREE.Vector3().crossVectors(axis, u).normalize();
                  for (const direction of [
                    u,
                    u.clone().negate(),
                    v,
                    v.clone().negate(),
                  ]) {
                    const ray = new THREE.Ray(p, direction.normalize()),
                      distances: number[] = [];
                    for (const triangle of shell) {
                      if (triangle.side !== side) continue;
                      const f = triangle.vertices;
                      const hit = ray.intersectTriangle(
                        f[0],
                        f[1],
                        f[2],
                        false,
                        new THREE.Vector3(),
                      );
                      if (hit) {
                        const distance = hit.distanceTo(p);
                        if (
                          distance > 0.00001 &&
                          !distances.some(
                            (d) => Math.abs(d - distance) < 0.00001,
                          )
                        )
                          distances.push(distance);
                      }
                    }
                    if (distances.some((d) => d < 1)) covered++;
                  }
                  assert.equal(
                    covered,
                    4,
                    `${head}/${weight}/${pose}/${t} calf visible through trouser shell at ${p0.toArray()}: ${covered}/4 blocked views`,
                  );
                  checked++;
                }
              assert.ok(checked > 12);
            }
        } finally {
          a.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});

test("Moonwake trousers hide visible skin from eight exterior views through deep knee flex, separating actual cuff apertures", async () => {
  const lib = library();
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        const recipe = structuredClone(look.appearance);
        recipe.body = { weight };
        await a.setAppearance(recipe);
        const original = captureRestAnatomy(a.object);
        for (let frame = 0; frame < 90; frame++) {
          a.update(frame / 60, { gesture: "run" });
          if (frame % 15) continue;
          const result = measureTrouserClearance(
            a.object,
            "bottom-moonwake-wide",
            original,
          );
          assert.equal(result.cuffApertures.length, 2);
          assert.ok(result.visibleSamples > 1000);
          assert.deepEqual(
            result.exposedSamples,
            [],
            `build ${weight}, frame ${frame}: visible skin pierced the pants (open-cuff sight lines are separately classified)`,
          );
        }
      } finally {
        a.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
});
