import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  validateCatalog,
  validateRecipe,
  type Catalog,
} from "../src";
import { parseLook } from "../app/atelier-state";
import "./helpers/node-image";
import { measureTrouserClearance } from "./helpers/kiln-clearance";

const catalog: Catalog = JSON.parse(
  await readFile(
    new URL("../public/capsule/catalog.json", import.meta.url),
    "utf8",
  ),
);
const base: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const set = JSON.parse(
  await readFile(
    new URL("../public/capsule/sets/kiln-workshop.json", import.meta.url),
    "utf8",
  ),
);
const ids: string[] = set.components.map((p: { id: string }) => p.id);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL(
        "../public/capsule" + new URL(String(input)).pathname,
        import.meta.url,
      ),
    ),
  );
const library = () => new AvatarLibrary(catalog, "https://kiln.test/", fetcher);
function owner(o: THREE.Object3D): string | undefined {
  let p: THREE.Object3D | null = o;
  while (p && !p.userData.assetId) p = p.parent;
  return p?.userData.assetId;
}
function meshes(o: THREE.Object3D, id: string) {
  const r: THREE.Mesh[] = [];
  o.traverse((m) => {
    if (m instanceof THREE.Mesh && owner(m) === id) r.push(m);
  });
  return r;
}
function points(m: THREE.Mesh) {
  if (m instanceof THREE.SkinnedMesh) m.skeleton.update();
  return Array.from(
    { length: m.geometry.getAttribute("position").count },
    (_, i) =>
      m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld),
  );
}
function triangles(source: THREE.Mesh[]) {
  return source.flatMap((m) => {
    const p = points(m),
      ix = m.geometry.index;
    return Array.from({ length: (ix?.count ?? p.length) / 3 }, (_, i) =>
      [0, 1, 2].map((j) => p[ix?.getX(i * 3 + j) ?? i * 3 + j]),
    );
  });
}
function crossings(source: THREE.Mesh[], target: THREE.Mesh[]) {
  const targetTriangles = triangles(target);
  let hits = 0;
  for (const t of triangles(source))
    for (let j = 0; j < 3; j++) {
      const a = t[j],
        b = t[(j + 1) % 3],
        dir = b.clone().sub(a),
        length = dir.length();
      if (length < 0.0002) continue;
      const ray = new THREE.Ray(a, dir.normalize());
      for (const q of targetTriangles) {
        const p = ray.intersectTriangle(
          q[0],
          q[1],
          q[2],
          false,
          new THREE.Vector3(),
        );
        if (
          p &&
          p.distanceTo(a) > 0.0001 &&
          p.distanceTo(a) < length - 0.0001
        ) {
          hits++;
          break;
        }
      }
    }
  return hits;
}
function completeLook(head = "head-scout", weight = 0) {
  const r = defaultRecipe(catalog);
  for (const c of set.components) r.parts[c.slot] = c.id;
  Object.assign(r.parts, { head, hair: "hair-pony", face: "face-grin" });
  Object.assign(r.colors, set.palette);
  r.body = { weight };
  return r;
}

test("Kiln collection contains exactly five independently collectible IDs and an importable full SHIFT look", async () => {
  assert.equal(set.format, "shift-collectible-set");
  assert.equal(set.version, 1);
  assert.equal(set.id, "kiln-workshop");
  assert.deepEqual(
    set.components.map((p: { slot: string }) => p.slot),
    ["headwear", "shirt", "bottom", "shoes", "accessory"],
  );
  assert.equal(new Set(ids).size, 5);
  const complete = (owned: Set<string>) =>
    set.components.every((c: { id: string }) => owned.has(c.id));
  assert.equal(complete(new Set(ids)), true);
  assert.equal(complete(new Set()), false);
  for (let mask = 0; mask < 32; mask++)
    assert.equal(
      complete(new Set(ids.filter((_, i) => mask & (1 << i)))),
      mask === 31,
    );
  for (const id of ids)
    assert.equal(
      complete(new Set(ids.filter((other) => other !== id))),
      false,
      `missing ${id}`,
    );
  validateCatalog(catalog);
  assert.deepEqual(catalog.rig, base.rig);
  assert.deepEqual(catalog.budgets, base.budgets);
  const wield = JSON.parse(
    await readFile(
      new URL("../public/wield/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const look = parseLook(
    await readFile(
      new URL(
        "../public/capsule/looks/kiln-workshop.shift.json",
        import.meta.url,
      ),
      "utf8",
    ),
    catalog,
    wield,
  );
  for (const c of set.components)
    assert.equal(look.appearance.parts[c.slot], c.id);
  for (const slot of ["head", "hair", "face"])
    assert.ok(base.assets.some((a) => a.id === look.appearance.parts[slot]));
  assert.deepEqual(set.palette, {
    primary: "#bd684b",
    secondary: "#494640",
    trim: "#ecdab6",
    accent: "#88b3a1",
  });
  let total = 0;
  for (const id of ids) {
    const a = catalog.assets.find((a) => a.id === id)!;
    const bytes = await readFile(
      new URL("../public/capsule/" + a.url, import.meta.url),
    );
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    assert.equal(a.rig, "athlete-reference-v2");
    total += a.triangles;
  }
  assert.ok(total <= 2800, `five pieces use ${total} triangles`);
});

test("each Kiln slot swaps independently with legacy pieces at both heads and build extremes", async () => {
  const lib = library();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1])
        for (const id of ids) {
          const a = lib.create();
          try {
            const recipe = defaultRecipe(catalog),
              part = catalog.assets.find((p) => p.id === id)!;
            recipe.parts[part.slot] = id;
            recipe.parts.head = head;
            recipe.body = { weight };
            validateRecipe(recipe, catalog);
            await a.setAppearance(recipe);
            assert.equal(a.recipe?.parts[part.slot], id);
            assert.ok(meshes(a.object, id).length);
            assert.ok(a.diagnostics().sourceTriangles <= 14000);
            a.object.updateMatrixWorld(true);
            for (const m of meshes(a.object, id))
              assert.ok(
                points(m).every((p) => p.toArray().every(Number.isFinite)),
              );
          } finally {
            a.dispose();
          }
        }
  } finally {
    lib.dispose();
  }
});

test("complete Kiln set retains normalized shared skins, leg/shin blends, floor contact and mixed-set ankle envelopes", async () => {
  const lib = library();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const a = lib.create();
        try {
          await a.setAppearance(completeLook(head, weight));
          a.object.updateMatrixWorld(true);
          const rest = new Map<THREE.Mesh, THREE.Vector3[]>();
          let blendedKnee = 0;
          for (const id of ids)
            for (const m of meshes(a.object, id)) {
              rest.set(m, points(m));
              if (m instanceof THREE.SkinnedMesh) {
                const w = m.geometry.getAttribute("skinWeight"),
                  ix = m.geometry.getAttribute("skinIndex");
                for (let i = 0; i < w.count; i++) {
                  let sum = 0,
                    leg = 0,
                    shin = 0;
                  for (let j = 0; j < 4; j++) {
                    const v = w.getComponent(i, j);
                    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
                    sum += v;
                    const name = m.skeleton.bones[ix.getComponent(i, j)].name;
                    if (name.startsWith("leg_")) leg += v;
                    if (name.startsWith("shin_")) shin += v;
                  }
                  assert.ok(Math.abs(sum - 1) < 0.005);
                  if (id === "bottom-kiln-cuffed" && leg > 0.01 && shin > 0.01)
                    blendedKnee++;
                }
                for (const b of m.skeleton.bones) {
                  const socket = a.attachmentView()!.sockets.get(b.name);
                  assert.ok(socket);
                  assert.ok(
                    b
                      .getWorldPosition(new THREE.Vector3())
                      .distanceTo(
                        socket!.getWorldPosition(new THREE.Vector3()),
                      ) < 0.002,
                  );
                }
              }
            }
          assert.ok(
            blendedKnee > 0,
            "trousers must blend actual knee articulation",
          );
          const pants = meshes(a.object, "bottom-kiln-cuffed").flatMap(points);
          assert.ok(Math.min(...pants.map((p) => p.y)) > 0.28);
          assert.ok(
            pants.every((p) => Math.abs(p.z) < 0.3 && Math.abs(p.x) < 0.4),
            "no authoring helper or crossed far-away vertex may enter the pants",
          );
          const shoes = meshes(a.object, "shoes-kiln-clogs").flatMap(points);
          assert.ok(Math.abs(Math.min(...shoes.map((p) => p.y))) < 0.012);
          for (const m of meshes(a.object, "shoes-kiln-clogs"))
            if (m instanceof THREE.SkinnedMesh) {
              const weights = m.geometry.getAttribute("skinWeight"),
                ix = m.geometry.getAttribute("skinIndex"),
                p = points(m);
              for (let i = 0; i < p.length; i++) {
                let foot = 0;
                for (let j = 0; j < 4; j++)
                  if (
                    m.skeleton.bones[ix.getComponent(i, j)].name.startsWith(
                      "foot_",
                    )
                  )
                    foot += weights.getComponent(i, j);
                if (foot > 0.999)
                  assert.ok(p[i].y <= 0.26, `rigid shoe ${p[i].y}`);
              }
            }
          let time = 0;
          for (const motion of ["run", "wave"] as const)
            for (let frame = 0; frame < 72; frame++) {
              time += 1 / 60;
              a.update(
                time,
                motion === "run"
                  ? { velocity: { x: frame < 36 ? 0 : 2.2, z: 5.4 } }
                  : { emote: { id: "wave", elapsed: frame / 60 } },
              );
              a.object.updateMatrixWorld(true);
              for (const [m, before] of rest) {
                const after = points(m);
                assert.ok(
                  after.every(
                    (p) =>
                      p.toArray().every(Number.isFinite) &&
                      Math.abs(p.x) < 1.6 &&
                      Math.abs(p.z) < 1.6 &&
                      p.y > -0.21 &&
                      p.y < 2.6,
                  ),
                );
                const ix = m.geometry.index;
                for (let k = 0; k < (ix?.count ?? after.length); k += 3)
                  for (let j = 0; j < 3; j++) {
                    const v = ix?.getX(k + j) ?? k + j,
                      w = ix?.getX(k + ((j + 1) % 3)) ?? k + ((j + 1) % 3);
                    assert.ok(
                      after[v].distanceTo(after[w]) <=
                        before[v].distanceTo(before[w]) * 3 + 0.02,
                      `${owner(m)} ${motion} tears`,
                    );
                  }
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

test("closed folded cap has one general crown field and clears both heads and every actual fitted legacy hairstyle", async () => {
  const cap = catalog.assets.find((a) => a.id === "hat-kiln-folded")!;
  assert.equal(cap.hairFit?.length, 1);
  assert.equal(cap.hairFit?.[0].mode, "contain");
  const lib = library();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const hair of base.assets.filter((a) => a.slot === "hair")) {
        const a = lib.create();
        try {
          const r = completeLook(head);
          r.parts.hair = hair.id;
          r.parts.eyewear = "acc-glasses";
          await a.setAppearance(r);
          a.object.updateMatrixWorld(true);
          const hat = meshes(a.object, cap.id),
            h = meshes(a.object, hair.id),
            skin = meshes(a.object, head);
          assert.equal(
            crossings(h, hat) + crossings(hat, h),
            0,
            `${head}/${hair.id} intersects cap`,
          );
          assert.equal(
            crossings(skin, hat) + crossings(hat, skin),
            0,
            `${head} intersects cap`,
          );
          assert.equal(a.recipe?.parts.hair, hair.id);
        } finally {
          a.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});

test("full collection accepts every compatible optional slot without changing original resource caps", async () => {
  const lib = library();
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1])
        for (const hair of base.assets.filter((a) => a.slot === "hair")) {
          const a = lib.create();
          try {
            const r = completeLook(head, weight);
            r.parts.hair = hair.id;
            r.parts.facialHair = "facial-mustache";
            r.parts.eyewear = "acc-glasses";
            r.parts.effect = "effect-orbit";
            await a.setAppearance(r);
            const d = a.diagnostics();
            assert.ok(d.sourceTriangles <= 14000);
            assert.ok(
              [catalog.base, ...Object.values(r.parts)]
                .filter(Boolean)
                .reduce(
                  (sum, id) =>
                    sum + catalog.assets.find((p) => p.id === id)!.bytes,
                  0,
                ) <= 1500000,
            );
            assert.ok(d.parts <= 12);
          } finally {
            a.dispose();
          }
        }
  } finally {
    lib.dispose();
  }
});

test("actual posed trouser and short-sleeve shells clear covered anatomy at all body weights", async () => {
  const report: unknown[] = [];
  const lib = library();
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        await a.setAppearance(completeLook("head-spark", weight));
        a.object.updateMatrixWorld(true);
        const anatomy = meshes(a.object, catalog.base);
        const original = new Map(anatomy.map((m) => [m, points(m)]));
        let time = 0;
        for (const pose of [
          "rest",
          "run-1",
          "run-2",
          "run-3",
          "run-4",
          "wave-1",
          "wave-2",
        ] as const) {
          for (let frame = 0; frame < 30; frame++) {
            time += 1 / 60;
            a.update(
              time,
              pose.startsWith("run")
                ? { velocity: { x: 0, z: 5.4 } }
                : pose.startsWith("wave")
                  ? {
                      emote: {
                        id: "wave",
                        elapsed: (pose === "wave-2" ? 0.5 : 0) + frame / 60,
                      },
                    }
                  : { reducedMotion: true },
            );
          }
          a.object.updateMatrixWorld(true);
          const shells = {
            pants: triangles(meshes(a.object, "bottom-kiln-cuffed")),
            sleeves: triangles(meshes(a.object, "shirt-kiln-apron")),
          };
          const clearance = measureTrouserClearance(
            a.object,
            "bottom-kiln-cuffed",
            original,
          );
          report.push({ weight, pose, ...clearance });
          assert.ok(clearance.visibleSamples > 100);
          assert.equal(clearance.cuffApertures.length, 2);
          if (pose === "rest")
            assert.equal(
              clearance.bodyCrossings,
              0,
              `${weight} rest trouser/body intersections ${JSON.stringify(clearance.crossingPoints)}`,
            );
          assert.deepEqual(
            clearance.exposedSamples,
            [],
            `${weight} ${pose} skin pierces trousers ${JSON.stringify(clearance)}`,
          );
          let probes = 0;
          const bad: unknown[] = [];
          for (const m of anatomy)
            for (const [i, p] of points(m).entries()) {
              const p0 = original.get(m)![i];
              const kind =
                Math.abs(p0.x) > 0.208 && p0.y > 1.33 && p0.y < 1.4
                  ? "sleeves"
                  : null;
              if (!kind) continue;
              const side = p0.x < 0 ? "L" : "R",
                sockets = a.attachmentView()!.sockets;
              const bone = "arm_",
                next = "forearm_";
              const start = sockets
                  .get(bone + side)!
                  .getWorldPosition(new THREE.Vector3()),
                end = sockets
                  .get(next + side)!
                  .getWorldPosition(new THREE.Vector3());
              const candidates = [new THREE.Line3(start, end)];
              const center = candidates
                .map((segment) =>
                  segment.closestPointToPoint(p, true, new THREE.Vector3()),
                )
                .sort((a, b) => a.distanceTo(p) - b.distanceTo(p))[0];
              const normal = p.clone().sub(center).normalize(),
                ray = new THREE.Ray(
                  p.clone().addScaledVector(normal, 0.5),
                  normal.clone().negate(),
                );
              let nearest = Infinity;
              for (const tri of shells[kind]) {
                const hit = ray.intersectTriangle(
                  tri[0],
                  tri[1],
                  tri[2],
                  false,
                  new THREE.Vector3(),
                );
                if (hit)
                  nearest = Math.min(nearest, ray.origin.distanceTo(hit));
              }
              probes++;
              const clearance = 0.5 - nearest;
              if (clearance < -0.001 && bad.length < 6)
                bad.push({
                  kind,
                  clearance,
                  rest: p0.toArray(),
                  posed: p.toArray(),
                });
            }
          assert.ok(probes > 10);
          assert.deepEqual(
            bad,
            [],
            `${weight} ${pose} body escapes garment shell`,
          );
        }
      } finally {
        a.dispose();
      }
    }
    await writeFile(
      new URL("../docs/evidence/kiln/body-clearance.json", import.meta.url),
      JSON.stringify(
        {
          method:
            "Actual runtime triangles, all-anatomy intersections, visible-skin exterior rays with true open-cuff aperture classification",
          limits:
            "Interior fold overlaps remain diagnostic; this is not cloth collision simulation",
          assets: ids.map((id) => {
            const a = catalog.assets.find((a) => a.id === id)!;
            return { id, sha256: a.sha256 };
          }),
          samples: report,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    lib.dispose();
  }
});

test("the apron overshirt waist stays outside the trouser waistband during lean waves and runs", async () => {
  const lib = library();
  try {
    for (const weight of [-1, 0, 1]) {
      const a = lib.create();
      try {
        await a.setAppearance(completeLook("head-scout", weight));
        a.object.updateMatrixWorld(true);
        const top = meshes(a.object, "shirt-kiln-apron"),
          bottom = meshes(a.object, "bottom-kiln-cuffed");
        const select = (
          source: THREE.Mesh[],
          accept: (p: THREE.Vector3[]) => boolean,
        ) =>
          source.map((m) => {
            const pp = points(m),
              ix = m.geometry.index;
            const selected: number[][] = [];
            for (let k = 0; k < (ix?.count ?? pp.length); k += 3) {
              const indices = [0, 1, 2].map((j) => ix?.getX(k + j) ?? k + j);
              if (accept(indices.map((i) => pp[i]))) selected.push(indices);
            }
            return { m, selected };
          });
        const selections = [
          select(
            top,
            (pp) =>
              Math.min(...pp.map((p) => p.y)) < 1.18 &&
              Math.max(...pp.map((p) => p.y)) < 1.35,
          ),
          select(bottom, (pp) => Math.max(...pp.map((p) => p.y)) > 1.0),
        ];
        let time = 0;
        for (const pose of ["run", "wave"] as const)
          for (let frame = 0; frame < 90; frame++) {
            time += 1 / 60;
            a.update(
              time,
              pose === "run"
                ? { velocity: { x: 0, z: 5.4 } }
                : { emote: { id: "wave", elapsed: frame / 60 } },
            );
            if (frame % 15) continue;
            a.object.updateMatrixWorld(true);
            const surfaces = selections.map((items) =>
              items.flatMap(({ m, selected }) => {
                const pp = points(m);
                return selected.map((ids) => ids.map((i) => pp[i]));
              }),
            );
            let hits = 0;
            const samples: number[][] = [];
            const tmp = new THREE.Vector3();
            for (const [source, target] of [
              [surfaces[0], surfaces[1]],
              [surfaces[1], surfaces[0]],
            ])
              for (const tri of source)
                for (let edge = 0; edge < 3; edge++) {
                  const start = tri[edge],
                    direction = tri[(edge + 1) % 3].clone().sub(start),
                    length = direction.length();
                  if (length < 0.0002) continue;
                  const ray = new THREE.Ray(start, direction.normalize());
                  for (const other of target) {
                    const hit = ray.intersectTriangle(
                      other[0],
                      other[1],
                      other[2],
                      false,
                      tmp,
                    );
                    if (
                      hit &&
                      hit.distanceTo(start) > 0.0001 &&
                      hit.distanceTo(start) < length - 0.0001
                    ) {
                      hits++;
                      if (samples.length < 5) samples.push(hit.toArray());
                      break;
                    }
                  }
                }
            assert.equal(
              hits,
              0,
              `${weight} ${pose} ${frame} waistband pierces hem: ${JSON.stringify(samples)}`,
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
