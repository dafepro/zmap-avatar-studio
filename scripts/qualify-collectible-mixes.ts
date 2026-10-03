/** Read-only integration qualification of four independent set proposals. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  type Catalog,
  type Motion,
} from "../src";
import "../tests/helpers/node-image";
import { loadCapsuleParts } from "./capsule-descriptors.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const names = ["sunline", "moonwake", "kiln", "tideglass"];
const locations: Record<string, string> = Object.fromEntries(
  names.map((name) => [name, root]),
);
let destination = path.join(
  root,
  "docs/evidence/collectible-mixes/qualification.json",
);
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, "");
  if (key === "help") {
    console.log(
      "Usage: node --import tsx scripts/qualify-collectible-mixes.ts [--sunline PATH --moonwake PATH --kiln PATH --tideglass PATH] [--out FILE]",
    );
    process.exit(0);
  }
  const value = process.argv[++i];
  if (!value) throw Error(`Missing value for --${key}`);
  if (key === "out") destination = path.resolve(value);
  else if (names.includes(key)) locations[key] = path.resolve(value);
  else throw Error(`Unknown option --${key}`);
}
const fullNames = [
  "sunline-courier",
  "moonwake-festival",
  "kiln-workshop",
  "tideglass-explorer",
];
const slots = ["headwear", "shirt", "bottom", "shoes", "accessory"] as const;
const base = JSON.parse(
  await readFile(path.join(root, "public/catalog.json"), "utf8"),
) as Catalog;
const original = await loadCapsuleParts(
  path.join(root, "public/capsule"),
  base.assets.map((a) => a.id),
);
const files = new Map(
  base.assets.map((a) => [a.url, path.join(root, "public", a.url)]),
);
for (const p of original)
  files.set(p.url, path.join(root, "public/capsule", p.url));
const manifests: any[] = [];
const pieces: any[] = [];
for (const [i, name] of names.entries()) {
  const worktree = locations[name];
  const manifest = JSON.parse(
    await readFile(
      `${worktree}/public/capsule/sets/${fullNames[i]}.json`,
      "utf8",
    ),
  );
  assert.equal(
    manifest.components.length,
    5,
    `${name}: exactly five components`,
  );
  const ordered = slots.map((slot) => {
    const component = manifest.components.find((c: any) => c.slot === slot);
    assert.ok(component, `${name}: missing ${slot}`);
    return component;
  });
  manifests.push({ ...manifest, components: ordered });
  for (const component of ordered) {
    const p = JSON.parse(
      await readFile(
        `${worktree}/public/capsule/parts/${component.id}.json`,
        "utf8",
      ),
    );
    assert.equal(p.slot, component.slot);
    assert.equal(p.id, component.id);
    pieces.push(p);
    files.set(p.url, `${worktree}/public/capsule/${p.url}`);
  }
}
const catalog: Catalog = {
  ...base,
  id: "shift-capsule",
  revision: "1.0.0",
  assets: [
    ...base.assets,
    ...original.filter((p) => !pieces.some((piece) => piece.id === p.id)),
    ...pieces,
  ],
};
delete catalog.compatibleRecipeRevisions;
const library = new AvatarLibrary(
  catalog,
  "https://sets.test/",
  async (input) => {
    const relative = new URL(String(input)).pathname.slice(1),
      file = files.get(relative);
    if (!file) throw Error(`Unexpected asset ${relative}`);
    return new Response(await readFile(file));
  },
);
// Five-column orthogonal array over GF(4): every pair of piece choices occurs.
const mul2 = [0, 2, 3, 1];
const combinations: { label: string; choices: number[]; hair?: string }[] = [];
for (let a = 0; a < 4; a++)
  for (let b = 0; b < 4; b++)
    combinations.push({
      label: `pairwise-${a}-${b}`,
      choices: [a, b, a ^ b, a ^ mul2[b], a ^ b ^ mul2[b]],
    });
for (let a = 0; a < 4; a++)
  combinations.push({
    label: `complete-${names[a]}`,
    choices: [a, a, a, a, a],
  });
// Fitting can add triangles beyond descriptor counts, especially closed hats.
const heaviest = slots.map((slot) => {
  const candidate = pieces
    .filter((p) => p.slot === slot)
    .sort((a, b) => b.triangles - a.triangles)[0];
  return manifests.findIndex((m) =>
    m.components.some((c: any) => c.id === candidate.id),
  );
});
for (let hat = 0; hat < 4; hat++)
  for (const hair of base.assets.filter((a) => a.slot === "hair"))
    combinations.push({
      label: `extreme-hat-${names[hat]}-${hair.id}`,
      choices: [hat, ...heaviest.slice(1)],
      hair: hair.id,
    });
for (let i = 0; i < 5; i++)
  for (let j = i + 1; j < 5; j++) {
    const pairs = new Set(
      combinations.map((c) => `${c.choices[i]}:${c.choices[j]}`),
    );
    assert.equal(
      pairs.size,
      16,
      `Pairwise slot coverage ${slots[i]}/${slots[j]}`,
    );
  }
const report: any = {
  timestamp: new Date().toISOString(),
  source:
    "exact GLBs loaded and fitted by AvatarLibrary; local integration test, not browser evidence",
  rig: catalog.rig.id,
  budgets: catalog.budgets,
  assets: pieces.map((p) => ({
    id: p.id,
    sha256: p.sha256,
    triangles: p.triangles,
    bytes: p.bytes,
  })),
  cases: [],
  failures: [],
};
function owner(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent)
    if (p.userData.assetId) return p.userData.assetId;
}
let maxTriangles = 0,
  maxBytes = 0,
  minFloor = Infinity;
try {
  for (const combination of combinations)
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const avatar = library.create();
        const recipe = defaultRecipe(catalog);
        Object.assign(recipe.parts, {
          head,
          hair: combination.hair ?? "hair-volt",
          face: "face-volt",
          eyewear: "acc-glasses",
          facialHair: "facial-mustache",
          effect: "effect-orbit",
        });
        for (const [i, slot] of slots.entries())
          recipe.parts[slot] =
            manifests[combination.choices[i]].components[i].id;
        recipe.body = { weight };
        const record: any = {
          label: combination.label,
          head,
          weight,
          selection: recipe.parts,
          poses: [],
        };
        try {
          await avatar.setAppearance(recipe);
          const stats = avatar.diagnostics();
          Object.assign(record, stats);
          maxTriangles = Math.max(maxTriangles, stats.sourceTriangles);
          const selectedIds = new Set([
            "body-athletic",
            ...Object.values(recipe.parts).filter(Boolean),
          ]);
          const sourceBytes = catalog.assets
            .filter((a) => selectedIds.has(a.id))
            .reduce((n, a) => n + a.bytes, 0);
          record.sourceBytes = sourceBytes;
          maxBytes = Math.max(maxBytes, sourceBytes);
          assert.ok(sourceBytes <= catalog.budgets.maxBytes);
          assert.ok(stats.sourceTriangles <= catalog.budgets.maxTriangles);
          const view = avatar.attachmentView()!;
          const transforms = new Map(
            [...view.sockets].map(([name, bone]) => [
              name,
              { p: bone.position.toArray(), s: bone.scale.toArray() },
            ]),
          );
          let clock = 0;
          for (const [name, motion] of [
            ["rest", { reducedMotion: true }],
            ["walk", { gesture: "walk" }],
            ["run", { gesture: "run" }],
            ["wave", { emote: { id: "wave", elapsed: 0.9 } }],
            ["cheer", { emote: { id: "cheer", elapsed: 0.85 } }],
          ] as [string, Motion][]) {
            for (let frame = 0; frame < 80; frame++) {
              clock += 1 / 60;
              avatar.update(clock, motion);
            }
            avatar.object.updateMatrixWorld(true);
            let vertices = 0,
              shoeMin = Infinity,
              maxCoordinate = 0;
            avatar.object.traverseVisible((o) => {
              if (!(o instanceof THREE.Mesh) || o.userData.comicOutline) return;
              if (o instanceof THREE.SkinnedMesh) o.skeleton.update();
              if (name === "rest" && owner(o) === recipe.parts.bottom) {
                const p = o.geometry.getAttribute("position"),
                  idx = o.geometry.index;
                const points = Array.from({ length: p.count }, (_, i) =>
                  o
                    .getVertexPosition(i, new THREE.Vector3())
                    .applyMatrix4(o.matrixWorld),
                );
                for (let t = 0; t < (idx?.count ?? p.count); t += 3) {
                  const tri = [0, 1, 2].map(
                    (j) => points[idx ? idx.getX(t + j) : t + j],
                  );
                  const centerY = tri.reduce((n, v) => n + v.y, 0) / 3;
                  if (centerY < 0.65) {
                    const lo = Math.min(...tri.map((v) => v.x)),
                      hi = Math.max(...tri.map((v) => v.x));
                    assert.ok(
                      !(lo < -0.04 && hi > 0.04),
                      `${recipe.parts.bottom}: triangle ${t / 3} bridges both lower legs at rest`,
                    );
                  }
                }
              }
              const positions = o.geometry.getAttribute("position");
              for (let i = 0; i < positions.count; i++) {
                const v = o
                  .getVertexPosition(i, new THREE.Vector3())
                  .applyMatrix4(o.matrixWorld);
                assert.ok(
                  v.toArray().every(Number.isFinite),
                  `${owner(o)} ${name}: nonfinite vertex`,
                );
                maxCoordinate = Math.max(
                  maxCoordinate,
                  Math.abs(v.x),
                  Math.abs(v.y),
                  Math.abs(v.z),
                );
                if (owner(o) === recipe.parts.shoes)
                  shoeMin = Math.min(shoeMin, v.y);
                vertices++;
              }
            });
            assert.ok(
              maxCoordinate < 5,
              `${name}: mesh escaped body envelope (${maxCoordinate})`,
            );
            assert.ok(
              shoeMin >= -0.003,
              `${name}: sole below floor by ${-shoeMin}`,
            );
            minFloor = Math.min(minFloor, shoeMin);
            for (const [name, bone] of view.sockets) {
              assert.deepEqual(
                bone.position.toArray(),
                transforms.get(name)!.p,
                `${name}: translated bone`,
              );
              assert.deepEqual(
                bone.scale.toArray(),
                transforms.get(name)!.s,
                `${name}: scaled bone`,
              );
            }
            record.poses.push({
              name,
              vertices,
              lowestShoeVertex: shoeMin,
              maxAbsoluteCoordinate: maxCoordinate,
            });
          }
        } catch (error) {
          record.error = String(error);
          report.failures.push({
            label: combination.label,
            head,
            weight,
            error: String(error),
          });
        } finally {
          avatar.dispose();
          report.cases.push(record);
        }
        if (report.cases.length % 12 === 0)
          console.log(
            `Mixed qualification: ${report.cases.length}/${combinations.length * 6} cases, ${report.failures.length} failures`,
          );
      }
} finally {
  library.dispose();
}
Object.assign(report, {
  summary: {
    cases: report.cases.length,
    poses: report.cases.reduce((n: number, c: any) => n + c.poses.length, 0),
    pairwiseSlotPairs: 10,
    pairValuesPerSlotPair: 16,
    maximumSourceTriangles: maxTriangles,
    maximumSourceBytes: maxBytes,
    minimumShoeVertex: minFloor,
    failures: report.failures.length,
  },
});
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.summary, null, 2));
if (report.failures.length) process.exitCode = 1;
