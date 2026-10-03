import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import {
  defaultRecipe,
  validateCatalog,
  validateRecipe,
  type Catalog,
} from "../src/core";
import "./helpers/node-image";
import { loadCapsuleParts } from "../scripts/capsule-descriptors.mjs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const base: Catalog = JSON.parse(
  await readFile(new URL("public/catalog.json", root), "utf8"),
);
const stride = JSON.parse(
  await readFile(
    new URL("public/capsule/parts/shoes-stride.json", root),
    "utf8",
  ),
);
const catalog = structuredClone(base);
const additions = await loadCapsuleParts(
  fileURLToPath(new URL("public/capsule/", root)),
  base.assets.map((a) => a.id),
);
const capsuleIds = new Set(additions.map((a) => a.id));
catalog.id = "shift-capsule";
catalog.revision = "1.0.0";
delete catalog.compatibleRecipeRevisions;
catalog.assets.push(...additions);
validateCatalog(catalog);
const evidence = new URL("docs/evidence/stride/", root);
const emit = process.env.STRIDE_EVIDENCE === "1";
const report: Record<string, unknown> = {
  asset: stride,
  samples: [],
  note: "Actual exported GLB loaded and posed by AvatarLibrary; Node image shim only supplies PNG metadata, not WebGL rendering",
};
const snapshots: unknown[] = [];
const library = () =>
  new AvatarLibrary(catalog, "https://stride.test/", async (input) => {
    const name = new URL(String(input)).pathname.split("/").pop();
    return new Response(
      await readFile(
        new URL(
          `public/${capsuleIds.has(name!.replace(".glb", "")) ? "capsule/" : ""}models/${name}`,
          root,
        ),
      ),
    );
  });
function owner(o: THREE.Object3D): string | undefined {
  let current: THREE.Object3D | null = o;
  while (current && !current.userData.assetId) current = current.parent;
  return current?.userData.assetId;
}
function meshes(object: THREE.Object3D, id?: string) {
  const found: THREE.Mesh[] = [];
  object.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      !o.userData.comicOutline &&
      (!id || owner(o) === id)
    )
      found.push(o);
  });
  return found;
}
function points(mesh: THREE.Mesh) {
  return Array.from(
    { length: mesh.geometry.getAttribute("position").count },
    (_, i) =>
      mesh
        .getVertexPosition(i, new THREE.Vector3())
        .applyMatrix4(mesh.matrixWorld),
  );
}

function sockSamples(object: THREE.Object3D) {
  const samples: { mesh: THREE.Mesh; vertices: number[]; side: string }[] = [];
  for (const mesh of meshes(object, "body-athletic")) {
    if (!mesh.visible) continue;
    const rest = points(mesh),
      index = mesh.geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const p = vertices
        .reduce((sum, vertex) => sum.add(rest[vertex]), new THREE.Vector3())
        .multiplyScalar(1 / 3);
      if (p.y > 0.325 && p.y < 0.365)
        samples.push({ mesh, vertices, side: p.x < 0 ? "L" : "R" });
    }
  }
  return samples;
}

function sockClearance(
  object: THREE.Object3D,
  sockets: ReadonlyMap<string, THREE.Bone>,
  samples: ReturnType<typeof sockSamples>,
) {
  const shell = meshes(object, stride.id).flatMap((mesh) => {
    const ps = points(mesh),
      index = mesh.geometry.index!;
    return Array.from({ length: index.count / 3 }, (_, i) => [
      ps[index.getX(i * 3)],
      ps[index.getX(i * 3 + 1)],
      ps[index.getX(i * 3 + 2)],
    ]);
  });
  let clearance = Infinity;
  for (const sample of samples) {
    const p = sample.vertices
      .reduce(
        (sum, vertex) =>
          sum.add(
            sample.mesh
              .getVertexPosition(vertex, new THREE.Vector3())
              .applyMatrix4(sample.mesh.matrixWorld),
          ),
        new THREE.Vector3(),
      )
      .multiplyScalar(1 / 3);
    const axis = new THREE.Line3(
      sockets.get(`shin_${sample.side}`)!.getWorldPosition(new THREE.Vector3()),
      sockets.get(`foot_${sample.side}`)!.getWorldPosition(new THREE.Vector3()),
    );
    const center = axis.closestPointToPoint(p, true, new THREE.Vector3());
    const ray = new THREE.Ray(center, p.clone().sub(center).normalize());
    let distance = Infinity;
    for (const tri of shell) {
      const hit = ray.intersectTriangle(
        tri[0],
        tri[1],
        tri[2],
        false,
        new THREE.Vector3(),
      );
      if (hit) distance = Math.min(distance, hit.distanceTo(center));
    }
    assert.ok(
      Number.isFinite(distance),
      "sock must enclose the sampled calf radial direction",
    );
    clearance = Math.min(clearance, distance - p.distanceTo(center));
  }
  assert.ok(samples.length >= 10, "sample both exposed calf bands");
  assert.ok(clearance > 0.001, `sock penetrates calf: ${clearance} m`);
  return clearance;
}
function capture(object: THREE.Object3D, name: string) {
  const output = meshes(object)
    .filter((m) => {
      let p: THREE.Object3D | null = m;
      while (p) {
        if (!p.visible) return false;
        p = p.parent;
      }
      return true;
    })
    .map((m) => {
      const materials = (
        Array.isArray(m.material) ? m.material : [m.material]
      ) as THREE.MeshStandardMaterial[];
      const uv = m.geometry.getAttribute("uv");
      return {
        name: m.name,
        asset: owner(m),
        positions: points(m).map((p) => p.toArray()),
        indices: Array.from(m.geometry.index?.array ?? []),
        groups: m.geometry.groups,
        uv: uv
          ? Array.from({ length: uv.count }, (_, i) => [uv.getX(i), uv.getY(i)])
          : null,
        materials: materials.map((mat) => ({
          name: mat.name,
          color: mat.color.toArray(),
          transparent: mat.transparent,
          opacity: mat.opacity,
          texture: !!mat.map,
          side: mat.side,
        })),
      };
    });
  snapshots.push({
    name,
    source:
      "AvatarLibrary actual exported GLB world vertices after body fitting and skinning",
    meshes: output,
  });
}

test("Stride has exact shared binding, rigid pods and calf-following fabric at all builds and ankle angles", async () => {
  const lib = library();
  try {
    for (const weight of [-1, 0, 1]) {
      const avatar = lib.create();
      try {
        const recipe = defaultRecipe(catalog);
        recipe.parts.shoes = stride.id;
        recipe.body = { weight };
        Object.assign(recipe.colors, {
          primary: "#df693b",
          secondary: "#32283f",
          trim: "#f2e4c5",
          accent: "#c6ea4c",
        });
        validateRecipe(recipe, catalog);
        await avatar.setAppearance(recipe);
        avatar.update(0, { reducedMotion: true });
        const view = avatar.attachmentView()!;
        for (const bone of view.sockets.values()) bone.quaternion.identity();
        view.root.position.set(0, 0, 0);
        avatar.object.updateMatrixWorld(true);
        const shoeMeshes = meshes(
          avatar.object,
          stride.id,
        ) as THREE.SkinnedMesh[];
        assert.equal(
          shoeMeshes.length,
          4,
          "four palette primitives, no extra draw calls",
        );
        const bound: {
          mesh: THREE.SkinnedMesh;
          vertex: number;
          rest: THREE.Vector3;
          inverse: THREE.Matrix4;
          bone: THREE.Bone;
          kind: string;
        }[] = [];
        let cuff = 0,
          pod = 0,
          blended = 0;
        for (const mesh of shoeMeshes) {
          assert.ok(mesh instanceof THREE.SkinnedMesh);
          const indices = mesh.geometry.getAttribute("skinIndex"),
            weights = mesh.geometry.getAttribute("skinWeight");
          for (const [vertex, rest] of points(mesh).entries()) {
            const side = rest.x < 0 ? "L" : "R";
            let shin = 0,
              foot = 0;
            for (let c = 0; c < 4; c++) {
              const value = weights.getComponent(vertex, c);
              if (!value) continue;
              const name =
                mesh.skeleton.bones[indices.getComponent(vertex, c)].name;
              assert.ok(
                [`foot_${side}`, `shin_${side}`].includes(name),
                `${name} must not influence ${side} footwear`,
              );
              if (name.startsWith("shin_")) shin += value;
              else foot += value;
            }
            assert.ok(Math.abs(shin + foot - 1) < 0.002);
            if (shin > 0.05 && foot > 0.05) blended++;
            const kind = rest.y > 0.3 ? "cuff" : rest.y < 0.05 ? "pod" : "";
            if (!kind) continue;
            assert.ok(
              (kind === "cuff" ? shin : foot) > 0.999,
              `${kind} must be rigid to its anatomical owner`,
            );
            if (kind === "cuff") cuff++;
            else pod++;
            const bone = view.sockets.get(
              `${kind === "cuff" ? "shin" : "foot"}_${side}`,
            )!;
            bound.push({
              mesh,
              vertex,
              rest,
              inverse: bone.matrixWorld.clone().invert(),
              bone,
              kind,
            });
          }
        }
        assert.ok(cuff > 30 && pod > 30 && blended > 10);
        let worstError = 0;
        for (const angle of [-0.8, -0.35, 0, 0.6, 1]) {
          for (const side of ["L", "R"]) {
            view.sockets.get(`shin_${side}`)!.rotation.x =
              side === "L" ? -0.65 : 0.4;
            view.sockets.get(`foot_${side}`)!.rotation.x =
              side === "L" ? angle : -angle;
          }
          avatar.object.updateMatrixWorld(true);
          for (const p of bound) {
            const actual = p.mesh
              .getVertexPosition(p.vertex, new THREE.Vector3())
              .applyMatrix4(p.mesh.matrixWorld);
            const expected = p.rest
              .clone()
              .applyMatrix4(p.inverse)
              .applyMatrix4(p.bone.matrixWorld);
            worstError = Math.max(worstError, actual.distanceTo(expected));
            assert.ok(
              actual.distanceTo(expected) < 1e-5,
              `${p.kind} slips at weight ${weight}, ankle ${angle}`,
            );
          }
          if (emit && weight === 0 && angle === 0.6)
            capture(avatar.object, "ankle-roll");
        }
        (report.samples as unknown[]).push({
          weight,
          cuffVertices: cuff,
          podVertices: pod,
          blendedVertices: blended,
          maxOwnerSlipMeters: worstError,
          ankleAngles: [-0.8, -0.35, 0, 0.6, 1],
        });
      } finally {
        avatar.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
});

test("Stride runtime run sweep stays finite and within edge deformation limits at all builds", async () => {
  const lib = library();
  try {
    for (const weight of [-1, 0, 1]) {
      const avatar = lib.create();
      try {
        const recipe = defaultRecipe(catalog);
        recipe.parts.shoes = stride.id;
        recipe.parts.bottom = "bottom-court";
        recipe.parts.hair = "hair-volt";
        recipe.parts.face = "face-grin";
        recipe.body = { weight };
        Object.assign(recipe.colors, {
          primary: "#df693b",
          secondary: "#32283f",
          trim: "#f2e4c5",
          accent: "#c6ea4c",
        });
        await avatar.setAppearance(recipe);
        avatar.update(0, { reducedMotion: true });
        avatar.object.updateMatrixWorld(true);
        const shoeMeshes = meshes(avatar.object, stride.id);
        const rest = shoeMeshes.map(points);
        const calfSamples = sockSamples(avatar.object);
        let minimumCalfClearance = sockClearance(
          avatar.object,
          avatar.attachmentView()!.sockets,
          calfSamples,
        );
        if (emit) capture(avatar.object, `rest-${weight}`);
        let maxMovement = 0,
          worstEdgeExcess = -Infinity;
        for (let frame = 0; frame <= 120; frame++) {
          avatar.update(1 + frame / 60, { gesture: "run" });
          avatar.object.updateMatrixWorld(true);
          if (frame % 30 === 0)
            minimumCalfClearance = Math.min(
              minimumCalfClearance,
              sockClearance(
                avatar.object,
                avatar.attachmentView()!.sockets,
                calfSamples,
              ),
            );
          shoeMeshes.forEach((mesh, mi) => {
            const after = points(mesh),
              before = rest[mi];
            after.forEach((p, i) => {
              assert.ok(p.toArray().every(Number.isFinite));
              maxMovement = Math.max(maxMovement, p.distanceTo(before[i]));
            });
            const index = mesh.geometry.index!;
            for (let i = 0; i < index.count; i += 3)
              for (let e = 0; e < 3; e++) {
                const a = index.getX(i + e),
                  b = index.getX(i + ((e + 1) % 3));
                const excess =
                  after[a].distanceTo(after[b]) -
                  before[a].distanceTo(before[b]) * 3 -
                  0.02;
                worstEdgeExcess = Math.max(worstEdgeExcess, excess);
                assert.ok(
                  excess <= 0,
                  `Stride edge stretches at weight ${weight}, frame ${frame}`,
                );
              }
          });
          if (emit && [42, 60, 78].includes(frame))
            capture(avatar.object, `run-${weight}-${frame}`);
        }
        assert.ok(maxMovement > 0.1, "run must actually move shoes");
        (report.samples as unknown[]).push({
          weight,
          runFrames: 121,
          calfSamples: calfSamples.length,
          minimumCalfClearanceMeters: minimumCalfClearance,
          maxMovementMeters: maxMovement,
          worstEdgeExcessMeters: worstEdgeExcess,
          appearance: avatar.diagnostics(),
        });
      } finally {
        avatar.dispose();
      }
    }
  } finally {
    lib.dispose();
  }
  if (emit) {
    await mkdir(evidence, { recursive: true });
    await mkdir(new URL("outputs/stride/", root), { recursive: true });
    await writeFile(
      new URL("runtime-validation.json", evidence),
      JSON.stringify(report, null, 2) + "\n",
    );
    await writeFile(
      new URL("outputs/stride/runtime-snapshots.json", root),
      JSON.stringify(snapshots),
    );
  }
});

test("Stride preserves the source catalog and fits the unchanged maximal source budgets", () => {
  assert.equal(
    base.assets.some((a) => a.id === stride.id),
    false,
  );
  assert.ok(
    stride.triangles <= 1712,
    "piece must not exceed the existing high-shoe source count",
  );
  assert.ok(stride.bytes < 160000);
  const recipe = defaultRecipe(catalog);
  for (const slot of catalog.slots) {
    const choices = catalog.assets
      .filter((a) => a.slot === slot.id)
      .sort((a, b) => b.triangles - a.triangles);
    if (choices[0]) recipe.parts[slot.id] = choices[0].id;
  }
  recipe.parts.shoes = stride.id;
  validateRecipe(recipe, catalog);
});

test("Stride composes with both capsule tops and preserves existing capsule recipes", async () => {
  const previous = structuredClone(catalog);
  previous.assets = previous.assets.filter((a) => a.id !== stride.id);
  const oldRecipe = defaultRecipe(previous),
    before = structuredClone(oldRecipe);
  validateRecipe(oldRecipe, catalog);
  assert.deepEqual(oldRecipe, before);
  const lib = library();
  try {
    for (const shirt of ["shirt-circuit", "shirt-relay"])
      for (const weight of [-1, 0, 1]) {
        const avatar = lib.create();
        try {
          const recipe = defaultRecipe(catalog);
          for (const slot of catalog.slots) {
            const choices = catalog.assets
              .filter((a) => a.slot === slot.id)
              .sort((a, b) => b.triangles - a.triangles);
            if (choices[0]) recipe.parts[slot.id] = choices[0].id;
          }
          recipe.parts.shirt = shirt;
          recipe.parts.shoes = stride.id;
          recipe.parts.accessory = "acc-pulse-pack";
          recipe.body = { weight };
          validateRecipe(recipe, catalog);
          await avatar.setAppearance(recipe);
          for (const t of [0, 0.1, 0.2, 0.3])
            avatar.update(t, { gesture: "run" });
          avatar.object.updateMatrixWorld(true);
          assert.ok(
            avatar.diagnostics().sourceTriangles <=
              catalog.budgets.maxTriangles,
          );
          assert.ok(
            meshes(avatar.object, stride.id)
              .flatMap(points)
              .every((p) => p.toArray().every(Number.isFinite)),
          );
        } finally {
          avatar.dispose();
        }
      }
  } finally {
    lib.dispose();
  }
});
