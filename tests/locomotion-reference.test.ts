import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { locomotionData } from "../src/locomotion-data.js";
import {
  sampleLocomotion,
  movingLocomotion,
  locomotionPace,
  type LocomotionClip,
} from "../src/locomotion.js";
import { AvatarLibrary, type AvatarHandLayer } from "../src/runtime.js";
import { defaultRecipe, type Catalog } from "../src/core.js";
import "./helpers/node-image.js";

const catalog: Catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
type SourceFrame = { positions: number[]; rotations: number[] };
const source: {
  joints: { name: string }[];
  clips: Record<string, { duration: number; samples: SourceFrame[] }>;
} = JSON.parse(
  await readFile(
    new URL(
      "../assets/source/locomotion/kaykit/source-samples.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const sourcePosition = (frame: SourceFrame, name: string) => {
  const index = source.joints.findIndex((joint) => joint.name === name);
  assert.ok(index >= 0, `missing reference joint ${name}`);
  return new THREE.Vector3()
    .fromArray(frame.positions, index * 3)
    .multiply(new THREE.Vector3(-1, 1, 1));
};
const clips = Object.keys(locomotionData.clips) as LocomotionClip[];

test("baked retarget preserves the reference's evaluated limb directions on the actual catalog bind vectors", () => {
  let checks = 0,
    maximum = 0;
  for (const clip of clips) {
    const samples = source.clips[clip].samples;
    assert.equal(
      locomotionData.clips[clip].duration,
      source.clips[clip].duration,
    );
    assert.equal(locomotionData.clips[clip].frames.length, samples.length);
    // The last key is deliberately closed to the first; every other key must
    // still agree with the untouched author's evaluated pose, not a sine gait.
    for (let index = 0; index < samples.length - 1; index++) {
      const pose = sampleLocomotion(clip, index / (samples.length - 1));
      const world = new Map<string, THREE.Quaternion>();
      for (const socket of catalog.rig.sockets) {
        const q =
          pose.rotations.get(socket.id)?.clone() ?? new THREE.Quaternion();
        if (socket.parent) q.premultiply(world.get(socket.parent)!);
        world.set(socket.id, q);
      }
      for (const side of ["left", "right"]) {
        const suffix = side === "left" ? "L" : "R";
        for (const [bone, child, from, to] of [
          [
            `arm_${suffix}`,
            `forearm_${suffix}`,
            `${side}UpperArm`,
            `${side}Forearm`,
          ],
          [
            `forearm_${suffix}`,
            `hand_${suffix}`,
            `${side}Forearm`,
            `${side}Hand`,
          ],
          [`leg_${suffix}`, `shin_${suffix}`, `${side}Thigh`, `${side}Shin`],
          [`shin_${suffix}`, `foot_${suffix}`, `${side}Shin`, `${side}Ankle`],
        ]) {
          const socket = catalog.rig.sockets.find(
            (entry) => entry.id === child,
          )!;
          const actual = new THREE.Vector3()
            .fromArray(socket.position)
            .normalize()
            .applyQuaternion(world.get(bone)!);
          const expected = sourcePosition(samples[index], to)
            .sub(sourcePosition(samples[index], from))
            .normalize();
          const angle = actual.angleTo(expected);
          maximum = Math.max(maximum, angle);
          assert.ok(
            angle < 0.001,
            `${clip} frame ${index} ${bone}: ${((angle * 180) / Math.PI).toFixed(6)} degrees`,
          );
          checks++;
        }
      }
    }
  }
  assert.ok(checks > 1200, `${checks} independent limb direction comparisons`);
  assert.ok(maximum < 0.001);
  console.log({
    referenceLimbComparisons: checks,
    maximumDegrees: (maximum * 180) / Math.PI,
  });
});

test("all reference loops close, sample independently, and blend continuously through both gait boundaries", () => {
  for (const clip of clips) {
    const first = sampleLocomotion(clip, 0),
      before = sampleLocomotion(clip, 1 - 1e-7),
      after = sampleLocomotion(clip, 1e-7);
    assert.ok(first.root.distanceTo(before.root) < 0.00001);
    assert.ok(first.root.distanceTo(after.root) < 0.00001);
    for (const name of locomotionData.bones) {
      const a = first.rotations.get(name)!;
      assert.ok(Math.abs(a.length() - 1) < 2e-7);
      assert.ok(
        a
          .clone()
          .normalize()
          .angleTo(before.rotations.get(name)!.clone().normalize()) < 0.0001,
      );
      assert.ok(
        a
          .clone()
          .normalize()
          .angleTo(after.rotations.get(name)!.clone().normalize()) < 0.0001,
      );
    }
    first.root.set(999, 999, 999);
    first.rotations.get("hips")!.set(1, 0, 0, 0);
    assert.ok(
      sampleLocomotion(clip, 0).root.length() < 0.5,
      "instances cannot mutate the baked curves",
    );
  }
  for (const phase of [0, 0.13, 0.37, 0.68, 0.91]) {
    let previous: ReturnType<typeof movingLocomotion> | undefined;
    for (let speed = 0; speed <= 8; speed += 0.005) {
      const pose = movingLocomotion(speed, phase),
        pace = locomotionPace(speed);
      assert.ok(pose.root.toArray().every(Number.isFinite));
      assert.ok(pace.frequency > 0 && Number.isFinite(pace.frequency));
      assert.ok(pace.playbackRate > 0 && Number.isFinite(pace.playbackRate));
      assert.ok(
        Math.abs(pace.components.reduce((sum, c) => sum + c.weight, 0) - 1) <
          1e-8,
      );
      for (const [name, q] of pose.rotations) {
        assert.ok(q.toArray().every(Number.isFinite));
        assert.ok(Math.abs(q.length() - 1) < 2e-6);
        if (previous)
          assert.ok(
            q
              .clone()
              .normalize()
              .angleTo(previous.rotations.get(name)!.clone().normalize()) <
              0.025,
            `${name} jumps at ${speed}`,
          );
      }
      previous = pose;
    }
  }
});

test("the retained animation review assets match the recorded CC0 provenance", async () => {
  const base = new URL("../assets/source/locomotion/kaykit/", import.meta.url);
  const provenance = JSON.parse(
    await readFile(new URL("provenance.json", base), "utf8"),
  );
  assert.equal(provenance.license.id, "CC0-1.0");
  for (const file of provenance.rawFiles) {
    const bytes = await readFile(new URL(file.path, base));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
  assert.ok(
    clips.every((clip) =>
      [...provenance.selectedClips, ...provenance.comparisonClips].includes(
        clip,
      ),
    ),
  );
});
test("backward seam and every diagonal blend remain continuous in facing space", () => {
  for (const speed of [2.2, 5.4])
    for (let phase = 0; phase < 1; phase += 0.025) {
      let previous: ReturnType<typeof movingLocomotion> | undefined;
      for (let i = 0; i <= 360; i++) {
        const angle = (i * Math.PI) / 180;
        const pose = movingLocomotion(speed, phase, {
          x: Math.sin(angle) * speed,
          z: Math.cos(angle) * speed,
        });
        for (const [name, q] of pose.rotations)
          if (previous)
            assert.ok(
              q.angleTo(previous.rotations.get(name)!) < 0.07,
              `${name} seam at ${i}°, ${speed}`,
            );
        previous = pose;
      }
      const a = movingLocomotion(speed, phase, { x: 0.00001, z: -speed });
      const b = movingLocomotion(speed, phase, { x: -0.00001, z: -speed });
      for (const [name, q] of a.rotations)
        assert.ok(
          q.angleTo(b.rotations.get(name)!) < 0.0001,
          `${name} backward epsilon flip`,
        );
    }
});

const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL("../public" + new URL(String(input)).pathname, import.meta.url),
    ),
  );
const matrices = (avatar: ReturnType<AvatarLibrary["create"]>) => {
  avatar.object.updateMatrixWorld(true);
  const view = avatar.attachmentView()!;
  return [
    view.root.matrixWorld.toArray(),
    ...[...view.sockets.values()].map((bone) => bone.matrixWorld.toArray()),
  ];
};
test("reduced motion is a stable pose and invalid input cannot poison reference sampling", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    avatar = library.create();
  try {
    await avatar.setAppearance(defaultRecipe(catalog));
    for (let tick = 0; tick < 120; tick++)
      avatar.update(tick / 60, { velocity: { x: 0, z: 5.4 } });
    avatar.update(2, { reducedMotion: true, velocity: { x: 0, z: 5.4 } });
    const still = matrices(avatar);
    for (let tick = 121; tick < 180; tick++)
      avatar.update(tick / 60, {
        reducedMotion: true,
        velocity: { x: 0, z: 5.4 },
      });
    assert.deepEqual(matrices(avatar), still);
    assert.throws(
      () => avatar.update(3, { velocity: { x: Infinity, z: 5.4 } }),
      /finite/,
    );
    assert.deepEqual(matrices(avatar), still);
    avatar.update(3, { velocity: { x: 0, z: 2.2 } });
    assert.ok(matrices(avatar).flat().every(Number.isFinite));
  } finally {
    avatar.dispose();
    library.dispose();
  }
});

test("an empty hand-layer lease cannot erase the referenced locomotion torso", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    free = library.create(),
    leased = library.create();
  const emptyLayer: AvatarHandLayer = {
    validate() {},
    attach() {},
    detach() {},
    pose() {},
    update() {},
    dispose() {},
  };
  try {
    await Promise.all([
      free.setAppearance(defaultRecipe(catalog)),
      leased.setAppearance(defaultRecipe(catalog)),
    ]);
    const release = leased.claimHandLayer(emptyLayer);
    for (let tick = 0; tick < 120; tick++) {
      const motion = { velocity: { x: 0, z: 2.2 } };
      free.update(tick / 60, motion);
      leased.update(tick / 60, motion);
      const expected = free.attachmentView()!.sockets.get("chest")!.quaternion;
      const actual = leased.attachmentView()!.sockets.get("chest")!.quaternion;
      assert.ok(
        expected.clone().normalize().angleTo(actual.clone().normalize()) <
          0.00001,
        `idle lease suppresses authored chest at ${tick}`,
      );
    }
    release();
  } finally {
    free.dispose();
    leased.dispose();
    library.dispose();
  }
});

test("frozen timestamps and appearance replacement preserve the gait clock and keep the rig finite", async () => {
  const library = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    avatar = library.create();
  try {
    const recipe = defaultRecipe(catalog);
    await avatar.setAppearance(recipe);
    let time = 0;
    const motion = { velocity: { x: 0, z: 2.2 } };
    for (let tick = 0; tick < 90; tick++)
      avatar.update((time += 1 / 60), motion);
    const before = avatar.animationDiagnostics(),
      pose = matrices(avatar);
    for (let repeat = 0; repeat < 4; repeat++) avatar.update(time, motion);
    assert.deepEqual(avatar.animationDiagnostics().velocity, before.velocity);
    assert.equal(
      avatar.animationDiagnostics().locomotion.phase,
      before.locomotion.phase,
    );
    const refreshed = matrices(avatar);
    for (let row = 0; row < pose.length; row++)
      for (let col = 0; col < pose[row].length; col++)
        assert.ok(
          Math.abs(pose[row][col] - refreshed[row][col]) < 1e-7,
          `frozen pose changed row ${row}, column ${col}`,
        );
    for (const weight of [-1, 1, 0]) {
      await avatar.setAppearance({ ...recipe, body: { weight } });
      assert.equal(
        avatar.animationDiagnostics().locomotion.phase,
        before.locomotion.phase,
        "appearance refresh must not advance animation time",
      );
      assert.deepEqual(avatar.animationDiagnostics().velocity, before.velocity);
      assert.ok(matrices(avatar).flat().every(Number.isFinite));
    }
    avatar.update((time += 1 / 60), motion);
    assert.notEqual(
      avatar.animationDiagnostics().locomotion.phase,
      before.locomotion.phase,
    );
    assert.ok(matrices(avatar).flat().every(Number.isFinite));
  } finally {
    avatar.dispose();
    library.dispose();
  }
});
