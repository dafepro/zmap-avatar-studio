import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary, type Motion } from "../src/runtime";
import { defaultRecipe, type Catalog } from "../src/core";
import { WieldLibrary, WieldController } from "../src/wield-runtime";
import { emptyWieldLoadout, type WieldCatalog } from "../src/wield-core";
import {
  fieldToolBehaviors,
  type FieldToolPresentation,
} from "../src/field-tools";
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
async function setup() {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    avatar = library.create();
  await avatar.setAppearance(defaultRecipe(catalog));
  return {
    library,
    avatar,
    dispose() {
      avatar.dispose();
      library.dispose();
    },
  };
}

test("four-direction locomotion bends knees, fixes stance contacts in world space, and never scales or translates a joint", async () => {
  for (const [x, z] of [
    [0, 2],
    [0, -2],
    [2, 0],
    [-2, 0],
    [0, 4],
    [0, -4],
    [4, 0],
    [-4, 0],
    [2.8, 2.8],
    [-2.8, -2.8],
  ]) {
    const s = await setup(),
      view = s.avatar.attachmentView()!,
      rest = [...view.sockets.values()].map((bone) => ({
        bone,
        position: bone.position.clone(),
        scale: bone.scale.clone(),
      }));
    let previous: ReturnType<typeof s.avatar.animationDiagnostics> | undefined,
      contacts = 0,
      maxSlide = 0,
      maxError = 0,
      maxKnee = 0;
    for (let i = 0; i < 240; i++) {
      s.avatar.object.position.set((x * i) / 60, 0, (z * i) / 60);
      s.avatar.update(i / 60, { velocity: { x, z } });
      const current = s.avatar.animationDiagnostics();
      for (const [side, suffix] of [
        ["left", "L"],
        ["right", "R"],
      ]) {
        const foot = current.feet[side],
          before = previous?.feet[side];
        if (
          i > 60 &&
          foot.contact &&
          before?.contact &&
          foot.phase > before.phase
        ) {
          contacts++;
          maxSlide = Math.max(
            maxSlide,
            new THREE.Vector3()
              .fromArray(foot.position)
              .distanceTo(new THREE.Vector3().fromArray(before.position)),
          );
        }
        const actual = view.sockets
          .get("foot_" + suffix)!
          .getWorldPosition(new THREE.Vector3());
        maxError = Math.max(
          maxError,
          actual.distanceTo(new THREE.Vector3().fromArray(foot.position)),
        );
        maxKnee = Math.max(maxKnee, foot.kneeDegrees);
        assert.ok(actual.y >= 0.119, "sole must remain above the ground");
      }
      previous = current;
    }
    assert.ok(contacts > 50, `observable stance samples ${contacts}`);
    assert.ok(maxSlide < 1e-7, `world foot slide ${maxSlide}`);
    assert.ok(maxError < 1e-5, `IK ankle error ${maxError}`);
    assert.ok(maxKnee > 35 && maxKnee < 145, `natural flex ${maxKnee}`);
    for (const { bone, position, scale } of rest) {
      assert.deepEqual(bone.position, position);
      assert.deepEqual(bone.scale, scale);
    }
    s.dispose();
  }
});

test("direction changes and stopping converge smoothly; invalid inputs and frozen timestamps cannot mutate the pose", async () => {
  const s = await setup();
  let time = 0;
  for (let i = 0; i < 60; i++)
    s.avatar.update((time += 1 / 60), { velocity: { x: 0, z: 2 } });
  const before = s.avatar.animationDiagnostics().velocity;
  s.avatar.update((time += 1 / 60), { velocity: { x: 0, z: -2 } });
  const first = s.avatar.animationDiagnostics().velocity;
  assert.ok(first[1] > 0 && first[1] < before[1]);
  for (let i = 0; i < 120; i++)
    s.avatar.update((time += 1 / 60), { velocity: { x: 0, z: 0 } });
  assert.ok(
    new THREE.Vector2()
      .fromArray(s.avatar.animationDiagnostics().velocity)
      .length() < 1e-6,
  );
  const matrices = () =>
      [...s.avatar.attachmentView()!.sockets.values()].map((bone) =>
        bone.quaternion.toArray(),
      ),
    snapshot = matrices();
  assert.throws(
    () => s.avatar.update(time + 1 / 60, { velocity: { x: NaN, z: 0 } }),
    /finite/,
  );
  assert.deepEqual(matrices(), snapshot);
  s.avatar.update(time, { velocity: { x: 0, z: 0 } });
  assert.deepEqual(matrices(), snapshot);
  s.dispose();
});

test("deep action poses retain planted soles and full two-hand grip frames through landing and appearance replacement", async () => {
  const s = await setup(),
    library = new WieldLibrary(
      equipment,
      "https://assets.test/action/",
      fetcher,
    );
  let state: FieldToolPresentation = { phase: "impact" };
  const errors: unknown[] = [],
    controller = new WieldController(
      s.avatar,
      library,
      fieldToolBehaviors(() => ({
        ...state,
        carrierPitch:
          s.avatar.animationDiagnostics().pose.lean * 0.36 -
          s.avatar.animationDiagnostics().pose.recoil * 0.12,
      })),
      { onError: (error) => errors.push(error) },
    );
  await controller.setLoadout({
    ...emptyWieldLoadout(equipment),
    twoHanded: { item: "wield-wake-driver", primary: "right" },
  });
  let time = 0;
  const recipe = defaultRecipe(catalog);
  for (const weight of [-1, 0, 1]) {
    recipe.body = { weight };
    await s.avatar.setAppearance(recipe);
    for (const motion of [
      {
        grounded: true,
        pose: { crouch: 1, lean: 1, stance: 0.8, recoil: 0.12 },
      },
      { grounded: false, pose: { tuck: 0.8, crouch: 0.1, lean: 0.18 } },
      { grounded: true, pose: { crouch: 1, lean: 1, stance: 0.8 } },
    ] satisfies Motion[]) {
      state = { phase: motion.grounded ? "impact" : "leaping" };
      for (let i = 0; i < 50; i++) s.avatar.update((time += 1 / 60), motion);
      const view = s.avatar.attachmentView()!;
      for (const side of ["left", "right"] as const) {
        assert.equal(
          controller.getHand(side)?.state,
          "ready",
          errors.map(String).join("; "),
        );
        const frame = equipment.grips[side].frame,
          wrist = view.sockets.get(side === "left" ? "hand_L" : "hand_R")!;
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
        assert.ok(
          controller
            .getHand(side)!
            .anchor("grip")
            .matrixWorld.elements.every(
              (v, i) => Math.abs(v - expected.elements[i]) < 1e-5,
            ),
        );
        if (motion.grounded)
          assert.ok(
            Math.abs(
              view.sockets
                .get(side === "left" ? "foot_L" : "foot_R")!
                .getWorldPosition(new THREE.Vector3()).y - 0.12,
            ) < 1e-5,
          );
      }
      if (motion.grounded) {
        const contact = controller
          .getHand("right")!
          .anchor("ground")
          .getWorldPosition(new THREE.Vector3());
        assert.ok(
          contact.y >= -0.005 && contact.y < 0.13,
          `actual source ground contact ${contact.y}`,
        );
        const bounds = new THREE.Box3().setFromObject(
          controller.getHand("right")!.object,
          true,
        );
        assert.ok(
          bounds.min.y >= 0 && bounds.min.y < 0.01,
          `driver plate below floor ${bounds.min.y}`,
        );
      }
    }
  }
  assert.deepEqual(errors, []);
  controller.dispose();
  library.dispose();
  s.dispose();
});
