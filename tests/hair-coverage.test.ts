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

function ownedMeshes(root: THREE.Object3D, ids: readonly string[]) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    let owner: THREE.Object3D | null = object;
    while (owner && !owner.userData.assetId) owner = owner.parent;
    if (owner && ids.includes(owner.userData.assetId)) meshes.push(object);
  });
  return meshes;
}

function socketPosition(id: string): THREE.Vector3 {
  const socket = catalog.rig.sockets.find((socket) => socket.id === id)!;
  return new THREE.Vector3(...socket.position).add(
    socket.parent ? socketPosition(socket.parent) : new THREE.Vector3(),
  );
}

const headOrigin = socketPosition("head");
type Probe = { region: "rear" | "temple" | "crown"; ray: THREE.Raycaster };

function coverageProbes(): Probe[] {
  const probes: Probe[] = [];
  // These are the common covered scalp zones of the authored catalog, not the
  // face, exposed ear rims, or each style's intentionally different hairline.
  // Offset grid samples exercise triangle interiors as well as mesh vertices.
  for (const height of [-0.04, 0.0, 0.04, 0.08, 0.12, 0.16, 0.2])
    for (let degrees = 116; degrees <= 244; degrees += 8) {
      const angle = THREE.MathUtils.degToRad(degrees);
      const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      probes.push({
        region: "rear",
        ray: new THREE.Raycaster(
          headOrigin
            .clone()
            .addScaledVector(outward, 1)
            .add(new THREE.Vector3(0, height, 0)),
          outward.negate(),
          0,
          2,
        ),
      });
    }
  for (const height of [0.04, 0.075, 0.11, 0.145, 0.18])
    for (const sign of [-1, 1])
      for (let degrees = 78; degrees <= 110; degrees += 8) {
        const angle = THREE.MathUtils.degToRad(degrees * sign);
        const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        probes.push({
          region: "temple",
          ray: new THREE.Raycaster(
            headOrigin
              .clone()
              .addScaledVector(outward, 1)
              .add(new THREE.Vector3(0, height, 0)),
            outward.negate(),
            0,
            2,
          ),
        });
      }
  for (let x = -0.12; x <= 0.12; x += 0.024)
    for (let z = -0.135; z <= 0.105; z += 0.024)
      probes.push({
        region: "crown",
        ray: new THREE.Raycaster(
          headOrigin.clone().add(new THREE.Vector3(x, 1, z)),
          new THREE.Vector3(0, -1, 0),
          0,
          2,
        ),
      });
  return probes;
}

function coverageFailures(
  probes: Probe[],
  skin: THREE.Mesh[],
  covering: THREE.Mesh[],
) {
  const failures: string[] = [];
  const counts = { rear: 0, temple: 0, crown: 0 };
  for (const { region, ray } of probes) {
    const headHit = ray.intersectObjects(skin, false)[0];
    if (!headHit) continue;
    // Near the crown's outer edge an overhead ray can land on the exposed
    // forehead. The radial tests independently cover temples and the rear.
    if (region === "crown" && headHit.point.y - headOrigin.y < 0.15) continue;
    counts[region]++;
    const coveringHit = ray.intersectObjects(covering, false)[0];
    if (!coveringHit || coveringHit.distance > headHit.distance - 0.001) {
      const p = headHit.point.clone().sub(headOrigin);
      failures.push(
        `${region} at ${p
          .toArray()
          .map((n) => n.toFixed(3))
          .join(
            ",",
          )}: ${coveringHit ? `${((headHit.distance - coveringHit.distance) * 1000).toFixed(1)} mm clearance` : "no covering surface"}`,
      );
    }
  }
  for (const region of ["rear", "temple", "crown"] as const)
    assert.ok(
      counts[region] >= 40,
      `${region} needs at least 40 actual scalp samples`,
    );
  return failures;
}

test("every hairstyle covers rear, temples and crown across both heads and body weights", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  const probes = coverageProbes();
  const failures: string[] = [];
  try {
    for (const head of catalog.assets.filter((asset) => asset.slot === "head"))
      for (const hair of catalog.assets.filter(
        (asset) => asset.slot === "hair",
      ))
        for (const weight of [-1, 0, 1]) {
          const avatar = library.create();
          try {
            const recipe = defaultRecipe(catalog);
            Object.assign(recipe.parts, { head: head.id, hair: hair.id });
            recipe.body = { weight };
            await avatar.setAppearance(recipe);
            avatar.object.updateMatrixWorld(true);
            const uncovered = coverageFailures(
              probes,
              ownedMeshes(avatar.object, [head.id]),
              ownedMeshes(avatar.object, [hair.id]),
            );
            if (uncovered.length)
              failures.push(
                `${head.id}/${hair.id}/weight=${weight}: ${uncovered.length} exposed samples; ${uncovered.slice(0, 3).join("; ")}`,
              );
          } finally {
            avatar.dispose();
          }
        }
    assert.equal(failures.length, 0, failures.join("\n"));
  } finally {
    library.dispose();
  }
});

test("accessory fitting preserves covered scalp instead of opening windows to skin", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  const probes = coverageProbes();
  const failures: string[] = [];
  try {
    for (const head of catalog.assets.filter((asset) => asset.slot === "head"))
      for (const hair of catalog.assets.filter(
        (asset) => asset.slot === "hair",
      ))
        for (const headwear of [
          null,
          ...catalog.assets
            .filter((asset) => asset.slot === "headwear")
            .map((asset) => asset.id),
        ])
          for (const eyewear of [
            null,
            ...catalog.assets
              .filter((asset) => asset.slot === "eyewear")
              .map((asset) => asset.id),
          ]) {
            if (headwear === null && eyewear === null) continue;
            for (const weight of [-1, 0, 1]) {
              const avatar = library.create();
              try {
                const recipe = defaultRecipe(catalog);
                Object.assign(recipe.parts, {
                  head: head.id,
                  hair: hair.id,
                  headwear,
                  eyewear,
                });
                recipe.body = { weight };
                await avatar.setAppearance(recipe);
                avatar.object.updateMatrixWorld(true);
                const uncovered = coverageFailures(
                  probes,
                  ownedMeshes(avatar.object, [head.id]),
                  ownedMeshes(avatar.object, [
                    hair.id,
                    ...(headwear ? [headwear] : []),
                  ]),
                );
                if (uncovered.length)
                  failures.push(
                    `${head.id}/${hair.id}/${headwear}/${eyewear}/weight=${weight}: ${uncovered.length} exposed samples; ${uncovered.slice(0, 3).join("; ")}`,
                  );
              } finally {
                avatar.dispose();
              }
            }
          }
    assert.equal(failures.length, 0, failures.join("\n"));
  } finally {
    library.dispose();
  }
});
