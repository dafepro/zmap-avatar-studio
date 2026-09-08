import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { defaultRecipe, type Catalog } from "../src/core";
import {
  emptyWieldLoadout,
  HANDS,
  WIELD_LIMITS,
  type WieldCatalog,
} from "../src/wield-core";
import {
  WieldController,
  WieldLibrary,
  WIELD_IK_LIMITS,
  solveWieldArm,
  type WieldBehaviorRegistry,
} from "../src/wield-runtime";
import "./helpers/node-image";

const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const equipment: WieldCatalog = JSON.parse(
  await readFile(
    new URL("../public/action/catalog.json", import.meta.url),
    "utf8",
  ),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("../public" + new URL(String(input)).pathname, import.meta.url),
    ),
  );

test("every real shared tool fits full wrist frames at three weights, both primary hands and bounded object motion without arm stretching", async () => {
  const avatars = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    library = new WieldLibrary(
      equipment,
      "https://assets.test/action/",
      fetcher,
    );
  const registry: WieldBehaviorRegistry = Object.fromEntries(
    equipment.items.map((item) => [
      item.behavior,
      {
        create: () => ({
          objectPose: (frame: { elapsed: number; reducedMotion: boolean }) => ({
            position: [
              0,
              frame.reducedMotion ? 0 : 0.006 * Math.sin(frame.elapsed * 3),
              0,
            ] as [number, number, number],
            rotation: [
              0,
              frame.reducedMotion ? 0 : 0.02 * Math.sin(frame.elapsed),
              0,
            ] as [number, number, number],
          }),
        }),
      },
    ]),
  );
  let combinations = 0;
  for (const item of equipment.items)
    for (const primary of HANDS) {
      const avatar = avatars.create(),
        recipe = defaultRecipe(catalog);
      await avatar.setAppearance(recipe);
      avatar.object.position.set(4, 1, -2);
      avatar.object.rotation.set(0.08, -0.8, 0.04);
      avatar.object.scale.setScalar(1.3);
      const controller = new WieldController(avatar, library, registry);
      await controller.setLoadout({
        ...emptyWieldLoadout(equipment),
        twoHanded: { item: item.id, primary },
      });
      const left = controller.getHand("left")!,
        right = controller.getHand("right")!;
      assert.equal(left.object, right.object);
      let time = 0;
      for (const weight of [-1, 0, 1]) {
        recipe.body = { weight };
        await avatar.setAppearance(recipe);
        assert.equal(controller.getHand("left"), left);
        assert.equal(controller.getHand("right"), right);
        const view = avatar.attachmentView()!;
        const rest = [...view.sockets.values()].map((bone) => ({
          bone,
          position: bone.position.clone(),
          scale: bone.scale.clone(),
        }));
        for (const gesture of ["idle", "walk", "run", "wave"] as const)
          for (const reducedMotion of [false, true]) {
            avatar.update((time += 0.05), {
              gesture,
              speed: gesture === "run" ? 1 : 0.5,
              reducedMotion,
            });
            assert.equal(left.state, "ready");
            assert.equal(right.state, "ready");
            for (const hand of HANDS) {
              const frame = equipment.grips[hand].frame,
                wrist = view.sockets.get(
                  hand === "left" ? "hand_L" : "hand_R",
                )!;
              const expected = wrist.matrixWorld
                .clone()
                .multiply(
                  new THREE.Matrix4().compose(
                    new THREE.Vector3().fromArray(frame.position),
                    new THREE.Quaternion().setFromEuler(
                      new THREE.Euler(...frame.rotation),
                    ),
                    new THREE.Vector3(1, 1, 1),
                  ),
                );
              const actual = controller
                .getHand(hand)!
                .anchor("grip").matrixWorld;
              assert.ok(
                actual.elements.every(
                  (value, i) => Math.abs(value - expected.elements[i]) < 1e-5,
                ),
                `${item.id}/${primary}/${weight}/${gesture}/${hand}`,
              );
              const solution = solveWieldArm(view, hand, wrist.matrixWorld);
              assert.ok(
                solution.elbowDegrees >= WIELD_IK_LIMITS.minElbowDegrees &&
                  solution.elbowDegrees <= WIELD_IK_LIMITS.maxElbowDegrees,
              );
              assert.ok(
                solution.wristDegrees <= WIELD_IK_LIMITS.maxWristDegrees,
              );
            }
            for (const { bone, position, scale } of rest) {
              assert.deepEqual(bone.position, position);
              assert.deepEqual(bone.scale, scale);
            }
          }
        const diagnostics = controller.diagnostics();
        assert.equal(
          diagnostics.heldTriangles,
          item.triangles +
            equipment.grips.left.triangles +
            equipment.grips.right.triangles,
        );
        assert.ok(diagnostics.heldTriangles <= WIELD_LIMITS.held);
        assert.ok(diagnostics.visibleTriangles <= WIELD_LIMITS.visible);
        assert.ok(diagnostics.heldBytes <= WIELD_LIMITS.heldBytes);
        combinations++;
      }
      controller.dispose();
      avatar.dispose();
    }
  assert.equal(combinations, equipment.items.length * HANDS.length * 3);
  avatars.dispose();
  library.dispose();
});
