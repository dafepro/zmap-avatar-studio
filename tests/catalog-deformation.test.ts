import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { defaultRecipe, type Catalog } from "../src/core";
import { WieldLibrary, WieldController } from "../src/wield-runtime";
import { emptyWieldLoadout, type WieldCatalog } from "../src/wield-core";
import { fieldToolBehaviors } from "../src/field-tools";
import "./helpers/node-image";

const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);

test("authored shoulder blends stay continuous during wave and running poses", async () => {
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
  );
  try {
    for (const asset of catalog.assets.filter((part) => part.skin)) {
      const recipe = defaultRecipe(catalog);
      if (asset.slot !== "body") recipe.parts[asset.slot] = asset.id;
      const avatar = library.create();
      try {
        await avatar.setAppearance(recipe);
        avatar.object.updateMatrixWorld(true);
        const meshes: THREE.SkinnedMesh[] = [];
        avatar.object.traverse((object) => {
          if (!(object instanceof THREE.SkinnedMesh)) return;
          let owner: THREE.Object3D | null = object;
          while (owner && !owner.userData.assetId) owner = owner.parent;
          if (owner?.userData.assetId === asset.id) meshes.push(object);
        });
        assert.ok(
          meshes.length,
          `${asset.id} must contain its declared deformable surfaces`,
        );
        let blendedShoulders = 0;
        for (const mesh of meshes) {
          const indices = mesh.geometry.getAttribute("skinIndex"),
            weights = mesh.geometry.getAttribute("skinWeight");
          for (let vertex = 0; vertex < indices.count; vertex++) {
            let chest = 0,
              arm = 0;
            for (let component = 0; component < 4; component++) {
              const bone =
                mesh.skeleton.bones[indices.getComponent(vertex, component)]
                  .name;
              const weight = weights.getComponent(vertex, component);
              if (bone === "chest") chest += weight;
              if (bone === "arm_R") arm += weight;
            }
            if (chest > 0.02 && arm > 0.02) blendedShoulders++;
          }
        }
        // The base's covered shoulder faces are removed under the required
        // shirt. The visible garment is the continuous shoulder surface.
        if (asset.slot === "shirt")
          assert.ok(
            blendedShoulders,
            `${asset.id} needs a chest-to-shoulder weight transition`,
          );
        const rest = meshes.map((mesh) =>
          Array.from(
            { length: mesh.geometry.getAttribute("position").count },
            (_, vertex) =>
              mesh
                .getVertexPosition(vertex, new THREE.Vector3())
                .applyMatrix4(mesh.matrixWorld),
          ),
        );
        // Waving does not move a calf; articulated footwear is qualified through locomotion.
        for (const gesture of asset.slot === "shoes"
          ? (["run"] as const)
          : (["wave", "run"] as const)) {
          if (gesture === "wave")
            avatar.update(1, { gesture, reducedMotion: true });
          else
            for (const time of [2, 2.1, 2.2, 2.3])
              avatar.update(time, { gesture });
          avatar.object.updateMatrixWorld(true);
          let maxMovement = 0,
            worstExcess = -Infinity;
          for (const [meshIndex, mesh] of meshes.entries()) {
            const before = rest[meshIndex];
            const after = before.map((point, vertex) => {
              const posed = mesh
                .getVertexPosition(vertex, new THREE.Vector3())
                .applyMatrix4(mesh.matrixWorld);
              assert.ok(
                posed.toArray().every(Number.isFinite),
                `${asset.id} produced a non-finite posed vertex`,
              );
              assert.ok(
                Math.abs(posed.x) < 1.5 &&
                  Math.abs(posed.z) < 1.5 &&
                  posed.y > -0.2 &&
                  posed.y < catalog.rig.height + 0.5,
                `${asset.id} escaped normal avatar bounds during ${gesture}`,
              );
              maxMovement = Math.max(maxMovement, posed.distanceTo(point));
              return posed;
            });
            const indices = mesh.geometry.index;
            const count = indices?.count ?? before.length;
            for (let triangle = 0; triangle < count; triangle += 3)
              for (let edge = 0; edge < 3; edge++) {
                const a = indices?.getX(triangle + edge) ?? triangle + edge;
                const b =
                  indices?.getX(triangle + ((edge + 1) % 3)) ??
                  triangle + ((edge + 1) % 3);
                // Small remeshing edges get 2 cm tolerance; larger edges may
                // stretch up to 3x in this stylized pose. This catches abrupt
                // bone-classification seams without treating tiny edges as tears.
                const allowed = before[a].distanceTo(before[b]) * 3 + 0.02;
                worstExcess = Math.max(
                  worstExcess,
                  after[a].distanceTo(after[b]) - allowed,
                );
              }
          }
          if (gesture === "run" || asset.slot !== "bottom")
            assert.ok(
              maxMovement > 0.04,
              `${asset.id} did not deform during ${gesture}`,
            );
          assert.ok(
            worstExcess <= 0,
            `${asset.id} ${gesture} tears a connected surface: edge exceeds continuity allowance by ${(worstExcess * 1000).toFixed(1)} mm`,
          );
        }
      } finally {
        avatar.dispose();
      }
    }
  } finally {
    library.dispose();
  }
});

test("pelvis and jersey waist stay connected across native strides and a held panel at every body weight", async (t) => {
  const fetcher: typeof fetch = async (input) =>
    new Response(
      await readFile(
        new URL("../public" + new URL(String(input)).pathname, import.meta.url),
      ),
    );
  const equipment: WieldCatalog = JSON.parse(
    await readFile(
      new URL("../public/action/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    wieldLibrary = new WieldLibrary(
      equipment,
      "https://assets.test/action/",
      fetcher,
    );
  let samples = 0;
  const worst = {
    excess: -Infinity,
    shirt: "",
    weight: 0,
    held: false,
    heading: 0,
    mesh: "",
    edge: [0, 0],
  };
  try {
    for (const shirt of catalog.assets.filter(
      (asset) => asset.slot === "shirt",
    ))
      for (const weight of [-1, 0, 1]) {
        const avatar = library.create();
        const errors: unknown[] = [];
        const controller = new WieldController(
          avatar,
          wieldLibrary,
          fieldToolBehaviors(() => ({ phase: "idle" })),
          { onError: (error) => errors.push(error) },
        );
        try {
          const recipe = defaultRecipe(catalog);
          recipe.parts.shirt = shirt.id;
          recipe.body = { weight };
          await avatar.setAppearance(recipe);
          avatar.object.updateMatrixWorld(true);
          const meshes: THREE.SkinnedMesh[] = [];
          avatar.object.traverse((object) => {
            if (!(object instanceof THREE.SkinnedMesh)) return;
            let owner: THREE.Object3D | null = object;
            while (owner && !owner.userData.assetId) owner = owner.parent;
            // Include covered anatomy: a base-mesh inspector must also remain
            // continuous. Hands/feet have separate rigid/ankle qualification.
            if (
              owner?.userData.assetId === shirt.id ||
              (owner?.userData.assetId === catalog.base &&
                ["upper-legs", "torso", "exposed"].includes(
                  object.userData.avatarRegion,
                ))
            )
              meshes.push(object);
          });
          assert.ok(
            meshes.some((mesh) => mesh.userData.avatarRegion === "upper-legs"),
          );
          const surfaces = meshes.map((mesh) => {
            const rest = Array.from(
              { length: mesh.geometry.getAttribute("position").count },
              (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()),
            );
            const edges = new Map<
              string,
              { a: number; b: number; allowed: number }
            >();
            const indices = mesh.geometry.index;
            for (
              let triangle = 0;
              triangle < (indices?.count ?? rest.length);
              triangle += 3
            )
              for (let edge = 0; edge < 3; edge++) {
                const a = indices?.getX(triangle + edge) ?? triangle + edge;
                const b =
                  indices?.getX(triangle + ((edge + 1) % 3)) ??
                  triangle + ((edge + 1) % 3);
                edges.set(`${Math.min(a, b)}:${Math.max(a, b)}`, {
                  a,
                  b,
                  allowed: rest[a].distanceTo(rest[b]) * 3 + 0.02,
                });
              }
            return {
              mesh,
              points: rest.map(() => new THREE.Vector3()),
              edges: [...edges.values()],
            };
          });
          let time = 0;
          for (const held of [false, true]) {
            if (held) {
              await controller.setLoadout({
                ...emptyWieldLoadout(equipment),
                twoHanded: { item: "wield-rebound-panel", primary: "right" },
              });
              assert.equal(
                controller.getHand("right")?.state,
                "ready",
                errors.map(String).join("; "),
              );
            }
            for (let heading = 0; heading < 8; heading++) {
              const angle = (heading * Math.PI) / 4;
              const motion = {
                velocity: {
                  x: Math.sin(angle) * 5.4,
                  z: Math.cos(angle) * 5.4,
                },
              };
              // Includes heading transitions, then more than two native sprint
              // cycles. Held strafing counter-rotates the chest against hip yaw.
              for (let frame = 0; frame < 48; frame++) {
                avatar.update((time += 1 / 24), motion);
                if (frame % 2) continue;
                avatar.object.updateMatrixWorld(true);
                for (const { mesh, points, edges } of surfaces) {
                  for (let i = 0; i < points.length; i++) {
                    mesh.getVertexPosition(i, points[i]);
                    assert.ok(points[i].toArray().every(Number.isFinite));
                  }
                  for (const { a, b, allowed } of edges) {
                    const excess = points[a].distanceTo(points[b]) - allowed;
                    if (excess > worst.excess)
                      Object.assign(worst, {
                        excess,
                        shirt: shirt.id,
                        weight,
                        held,
                        heading,
                        mesh: mesh.name,
                        edge: [a, b],
                      });
                  }
                }
                samples++;
              }
            }
          }
          assert.deepEqual(errors, []);
        } finally {
          controller.dispose();
          avatar.dispose();
        }
      }
    assert.ok(
      worst.excess <= 0,
      `native stride tears a connected surface: ${JSON.stringify(worst)}`,
    );
    t.diagnostic(JSON.stringify({ samples, worst }));
  } finally {
    wieldLibrary.dispose();
    library.dispose();
  }
});

test("reference jerseys hide covered shoulder skin while keeping forearms and hands visible", async () => {
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
  );
  const camera = new THREE.OrthographicCamera(
    -0.82,
    0.82,
    1.23,
    -1.23,
    0.05,
    20,
  );
  camera.position.set(0, 1.15, 5);
  camera.lookAt(0, 1.025, 0);
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  try {
    for (const shirt of catalog.assets
      .filter((a) => a.slot === "shirt")
      .map((a) => a.id)) {
      const avatar = library.create();
      try {
        const recipe = defaultRecipe(catalog);
        recipe.parts.shirt = shirt;
        await avatar.setAppearance(recipe);
        avatar.update(1.25, { gesture: "wave", reducedMotion: true });
        avatar.object.rotation.y = -0.1;
        avatar.object.updateMatrixWorld(true);
        const surfaces: THREE.Mesh[] = [],
          body: THREE.SkinnedMesh[] = [];
        avatar.object.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          if (object.visible) surfaces.push(object);
          let owner: THREE.Object3D | null = object;
          while (owner && !owner.userData.assetId) owner = owner.parent;
          if (
            owner?.userData.assetId === "body-athletic" &&
            object instanceof THREE.SkinnedMesh
          )
            body.push(object);
        });
        let checked = 0;
        for (const mesh of body) {
          const positions = mesh.geometry.getAttribute("position"),
            indices = mesh.geometry.index;
          for (
            let offset = 0;
            offset < (indices?.count ?? positions.count);
            offset += 3
          ) {
            const vertices = [0, 1, 2].map(
              (corner) => indices?.getX(offset + corner) ?? offset + corner,
            );
            const rest = vertices
              .reduce(
                (sum, vertex) =>
                  sum.add(
                    new THREE.Vector3().fromBufferAttribute(positions, vertex),
                  ),
                new THREE.Vector3(),
              )
              .multiplyScalar(1 / 3);
            // The new study has short sleeves. The explicit torso coverage
            // region includes the shoulders; wrists and hands stay exposed.
            if (mesh.userData.avatarRegion !== "torso") continue;
            assert.equal(
              mesh.visible,
              false,
              "covered anatomy must not render through clothing",
            );
            checked++;
            const posed = vertices
              .reduce(
                (sum, vertex) =>
                  sum.add(mesh.getVertexPosition(vertex, new THREE.Vector3())),
                new THREE.Vector3(),
              )
              .multiplyScalar(1 / 3)
              .applyMatrix4(mesh.matrixWorld);
            const projected = posed.clone().project(camera);
            raycaster.setFromCamera(
              new THREE.Vector2(projected.x, projected.y),
              camera,
            );
            const closest = raycaster.intersectObjects(surfaces, false)[0];
            // The prior defect left decimated body triangles protruding through
            // the inner elbow. Test actual posed surface visibility, not weights.
            assert.ok(
              closest?.object !== mesh ||
                closest.point.distanceTo(posed) >= 0.004,
              `${shirt} exposes elbow skin at rest (${rest
                .toArray()
                .map((value) => value.toFixed(3))
                .join(", ")})`,
            );
          }
        }
        assert.ok(
          checked > 100,
          `${shirt} must exercise the authored shoulder surfaces`,
        );
      } finally {
        avatar.dispose();
      }
    }
  } finally {
    library.dispose();
  }
});
