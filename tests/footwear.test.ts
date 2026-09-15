import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { defaultRecipe, type Catalog } from "../src/core";
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

/** Regression for the trailing bare-calf illusion exposed by authored ankle roll:
 * a crew sock's top must remain on the calf while its sole follows the foot. */
test("all footwear keeps fabric on the calf and soles rigid through full ankle articulation at every body weight", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher);
  try {
    for (const shoes of ["shoes-court", "shoes-runner", "shoes-high"]) {
      for (const weight of [-1, 0, 1]) {
        const avatar = library.create();
        try {
          const recipe = defaultRecipe(catalog);
          recipe.parts.shoes = shoes;
          recipe.body = { weight };
          await avatar.setAppearance(recipe);
          avatar.update(0, { reducedMotion: true });
          const view = avatar.attachmentView()!;
          // Asset qualification uses explicit joint angles, independently of gait choice.
          for (const bone of view.sockets.values()) bone.quaternion.identity();
          view.root.position.set(0, 0, 0);
          avatar.object.updateMatrixWorld(true);
          const meshes: THREE.SkinnedMesh[] = [];
          avatar.object.traverse((object) => {
            if (
              !(object instanceof THREE.SkinnedMesh) ||
              object.userData.comicOutline
            )
              return;
            let owner: THREE.Object3D | null = object;
            while (owner && !owner.userData.assetId) owner = owner.parent;
            if (owner?.userData.assetId === shoes) meshes.push(object);
          });
          assert.ok(
            meshes.length,
            `${shoes} must carry a declared deformable footwear skin`,
          );
          const points: {
            mesh: THREE.SkinnedMesh;
            vertex: number;
            rest: THREE.Vector3;
            bone: THREE.Bone;
            inverse: THREE.Matrix4;
            kind: string;
          }[] = [];
          let fabric = 0,
            sole = 0,
            blended = 0;
          for (const mesh of meshes) {
            const indices = mesh.geometry.getAttribute("skinIndex"),
              weights = mesh.geometry.getAttribute("skinWeight");
            for (let vertex = 0; vertex < indices.count; vertex++) {
              const rest = mesh
                .getVertexPosition(vertex, new THREE.Vector3())
                .applyMatrix4(mesh.matrixWorld);
              const side = rest.x < 0 ? "L" : "R";
              let shinWeight = 0,
                footWeight = 0;
              for (let component = 0; component < 4; component++) {
                const value = weights.getComponent(vertex, component);
                if (!value) continue;
                const name =
                  mesh.skeleton.bones[indices.getComponent(vertex, component)]
                    .name;
                assert.ok(
                  [`shin_${side}`, `foot_${side}`].includes(name),
                  `${shoes} vertex ${vertex} uses unrelated ${name}`,
                );
                if (name.startsWith("shin_")) shinWeight += value;
                else footWeight += value;
              }
              assert.ok(Math.abs(shinWeight + footWeight - 1) < 0.002);
              if (shinWeight > 0.05 && footWeight > 0.05) blended++;
              let name = "",
                kind = "";
              if (rest.y > 0.3) {
                assert.ok(
                  shinWeight > 0.999,
                  `${shoes} upper sock must remain on calf`,
                );
                name = `shin_${side}`;
                kind = "fabric";
                fabric++;
              } else if (rest.y < 0.05) {
                assert.ok(
                  footWeight > 0.999,
                  `${shoes} outsole must remain rigid`,
                );
                name = `foot_${side}`;
                kind = "sole";
                sole++;
              }
              if (name) {
                const bone = view.sockets.get(name)!;
                points.push({
                  mesh,
                  vertex,
                  rest,
                  bone,
                  inverse: bone.matrixWorld.clone().invert(),
                  kind,
                });
              }
            }
          }
          assert.ok(
            fabric > 30 && sole > 30 && blended > 10,
            `${shoes}: missing fabric, rigid shell or blended ankle`,
          );
          for (const angle of [-0.8, -0.35, 0, 0.6, 1.0]) {
            for (const side of ["L", "R"]) {
              view.sockets.get(`shin_${side}`)!.rotation.x =
                side === "L" ? -0.65 : 0.4;
              view.sockets.get(`foot_${side}`)!.rotation.x =
                side === "L" ? angle : -angle;
            }
            avatar.object.updateMatrixWorld(true);
            for (const point of points) {
              const actual = point.mesh
                .getVertexPosition(point.vertex, new THREE.Vector3())
                .applyMatrix4(point.mesh.matrixWorld);
              const expected = point.rest
                .clone()
                .applyMatrix4(point.inverse)
                .applyMatrix4(point.bone.matrixWorld);
              assert.ok(
                actual.distanceTo(expected) < 1e-5,
                `${shoes} weight ${weight} ${point.kind} slips off its anatomical owner at ankle ${angle}`,
              );
            }
          }
        } finally {
          avatar.dispose();
        }
      }
    }
  } finally {
    library.dispose();
  }
});
