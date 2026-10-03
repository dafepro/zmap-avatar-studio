/** Re-run from the repo root: node --import tsx public/capsule/validate-capsule.ts */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { AvatarLibrary } from "../../src/runtime";
import { defaultRecipe, validateCatalog, type Catalog } from "../../src/core";
import "../../tests/helpers/node-image";
const root = process.cwd();
const catalog: Catalog = JSON.parse(
  await readFile(path.join(root, "public/catalog.json"), "utf8"),
);
const parts = JSON.parse(
  await readFile(path.join(root, "public/capsule/parts.json"), "utf8"),
);
catalog.assets.push(...parts);
validateCatalog(catalog);
const ids = new Set(parts.map((p: any) => p.id));
const lib = new AvatarLibrary(
  catalog,
  "https://capsule.test/",
  async (input) => {
    const filename = path.basename(new URL(String(input)).pathname);
    return new Response(
      await readFile(
        path.join(
          root,
          ids.has(filename.replace(".glb", ""))
            ? "public/capsule/models"
            : "public/models",
          filename,
        ),
      ),
    );
  },
);
const report: any = {
  rig: catalog.rig.id,
  weights: [-1, 0, 1],
  poses: ["rest", "wave", "run"],
  parts: parts.map((p: any) => ({
    id: p.id,
    triangles: p.triangles,
    bytes: p.bytes,
    sha256: p.sha256,
  })),
  samples: [],
  sourceBudget: catalog.budgets,
};
function owner(o: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p && !p.userData.assetId) p = p.parent;
  return p?.userData.assetId;
}
function points(o: THREE.Mesh) {
  return Array.from(
    { length: o.geometry.getAttribute("position").count },
    (_, i) =>
      o.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(o.matrixWorld),
  );
}
function meshes(a: any, id: string) {
  const result: THREE.Mesh[] = [];
  a.object.traverse((o: any) => {
    if (o instanceof THREE.Mesh && owner(o) === id) result.push(o);
  });
  return result;
}
function continuity(o: THREE.Mesh, before: THREE.Vector3[]) {
  const after = points(o),
    index = o.geometry.index;
  let excess = -Infinity;
  for (let k = 0; k < (index?.count ?? before.length); k += 3) {
    for (let j = 0; j < 3; j++) {
      let a = index?.getX(k + j) ?? k + j,
        b = index?.getX(k + ((j + 1) % 3)) ?? k + ((j + 1) % 3);
      const e =
        after[a].distanceTo(after[b]) -
        before[a].distanceTo(before[b]) * 3 -
        0.02;
      excess = Math.max(excess, e);
    }
  }
  return excess;
}
try {
  for (const shirt of ["shirt-circuit", "shirt-relay"])
    for (const weight of [-1, 0, 1])
      for (const accessory of [null, "acc-pulse-pack"]) {
        const a = lib.create();
        const recipe = defaultRecipe(catalog);
        recipe.parts.shirt = shirt;
        recipe.parts.accessory = accessory;
        recipe.body = { weight };
        try {
          await a.setAppearance(recipe);
          a.update(0, { reducedMotion: true });
          a.object.updateMatrixWorld(true);
          const cloth = meshes(a, shirt),
            pack = accessory ? meshes(a, accessory) : [];
          const equipped = [...cloth, ...pack];
          const rest = equipped.map(points);
          assert.ok(cloth.some((o) => o instanceof THREE.SkinnedMesh));
          assert.ok(
            equipped
              .flatMap(points)
              .every((p) => p.toArray().every(Number.isFinite)),
          );
          const sample: any = {
            shirt,
            accessory,
            weight,
            meshCount: equipped.length,
            poses: [],
          };
          const anatomy = meshes(a, "body-athletic");
          const bodyRest = new Map(anatomy.map((m) => [m, points(m)]));
          function sleeveClearance() {
            const shell = cloth.flatMap((o) => {
              const p = points(o),
                idx = o.geometry.index;
              return Array.from(
                { length: (idx?.count ?? p.length) / 3 },
                (_, i) =>
                  [0, 1, 2].map((j) => p[idx?.getX(i * 3 + j) ?? i * 3 + j]),
              );
            });
            let checked = 0,
              outside = 0,
              minClearance = Infinity,
              worst: any = null;
            const joints = a.attachmentView()!.sockets;
            for (const b of anatomy) {
              if (!b.visible) continue;
              for (const [i, p] of points(b).entries()) {
                const p0 = bodyRest.get(b)![i];
                if (p0.y < 1.025 || p0.y > 1.305 || Math.abs(p0.x) < 0.185)
                  continue;
                const side = p0.x < 0 ? "L" : "R";
                const arm = joints
                    .get("arm_" + side)!
                    .getWorldPosition(new THREE.Vector3()),
                  elbow = joints
                    .get("forearm_" + side)!
                    .getWorldPosition(new THREE.Vector3()),
                  hand = joints
                    .get("hand_" + side)!
                    .getWorldPosition(new THREE.Vector3());
                const candidates = [
                  new THREE.Line3(arm, elbow),
                  new THREE.Line3(elbow, hand),
                ].map((seg) =>
                  seg.closestPointToPoint(p, true, new THREE.Vector3()),
                );
                candidates.sort((a, b) => a.distanceTo(p) - b.distanceTo(p));
                const center = candidates[0],
                  normal = p.clone().sub(center).normalize();
                const ray = new THREE.Ray(
                  p.clone().addScaledVector(normal, 1),
                  normal.clone().negate(),
                );
                let distance = Infinity;
                for (const t of shell) {
                  const hit = ray.intersectTriangle(
                    t[0],
                    t[1],
                    t[2],
                    false,
                    new THREE.Vector3(),
                  );
                  if (hit)
                    distance = Math.min(distance, hit.distanceTo(ray.origin));
                }
                const clearance = 1 - distance;
                checked++;
                if (clearance < minClearance) {
                  minClearance = clearance;
                  worst = { posed: p.toArray(), rest: p0.toArray() };
                }
                if (clearance < -0.001) outside++;
              }
            }
            return { checked, outside, minClearanceM: minClearance, worst };
          }
          if (shirt === "shirt-circuit") {
            sample.sleeveClearance = sleeveClearance();
            assert.equal(
              sample.sleeveClearance.outside,
              0,
              `${weight} rest sleeve clearance`,
            );
          }
          for (const gesture of ["wave", "run"] as const) {
            a.update(1, { gesture, reducedMotion: gesture === "wave" });
            if (gesture === "run")
              for (const t of [2, 2.1, 2.2, 2.3]) a.update(t, { gesture });
            a.object.updateMatrixWorld(true);
            const worst = Math.max(
              ...equipped.map((o, i) => continuity(o, rest[i])),
            );
            assert.ok(
              worst <= 0,
              `${shirt} ${weight} ${gesture} continuity excess ${worst}`,
            );
            assert.ok(
              equipped
                .flatMap(points)
                .every(
                  (p) => p.toArray().every(Number.isFinite) && p.length() < 3,
                ),
            );
            const coverage =
              shirt === "shirt-circuit" ? sleeveClearance() : undefined;
            if (coverage)
              assert.equal(
                coverage.outside,
                0,
                `${weight} ${gesture} sleeve clearance`,
              );
            sample.poses.push({
              gesture,
              edgeContinuityExcessM: worst,
              ...(coverage ? { sleeveClearance: coverage } : {}),
            });
          }
          report.samples.push(sample);
        } finally {
          a.dispose();
        }
      }
  // A fully stacked upper-resource combination must fail clearly if the original
  // rendering budget is exhausted; do not quietly enlarge the shared runtime.
  for (const shirt of ["shirt-circuit", "shirt-relay"]) {
    const a = lib.create(),
      recipe = defaultRecipe(catalog);
    for (const slot of catalog.slots) {
      const options = catalog.assets.filter((p) => p.slot === slot.id);
      options.sort((a, b) => b.triangles - a.triangles);
      recipe.parts[slot.id] = options[0]?.id ?? null;
    }
    recipe.parts.shirt = shirt;
    recipe.parts.accessory = "acc-pulse-pack";
    try {
      await a.setAppearance(recipe);
      report.maximumEquipment ??= [];
      report.maximumEquipment.push({
        shirt,
        status: "accepted",
        ...a.diagnostics(),
      });
    } catch (e) {
      report.maximumEquipment ??= [];
      report.maximumEquipment.push({
        shirt,
        status: "rejected",
        reason: String(e),
      });
    } finally {
      a.dispose();
    }
  }
  report.status = "passed";
  await writeFile(
    path.join(root, "public/capsule/validation.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        status: report.status,
        samples: report.samples.length,
        maximumEquipment: report.maximumEquipment,
      },
      null,
      2,
    ),
  );
} finally {
  lib.dispose();
}
