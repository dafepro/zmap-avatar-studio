import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  emoteDescriptors,
  type Catalog,
} from "../src";
import { performanceData } from "../src/performance-data";
import { snapSaluteData } from "../src/snap-salute-data";
import { samplePerformance } from "../src/performances";
import { createPerformanceFixture } from "./helpers/performance-fixture";
import "./helpers/node-image";

const catalog: Catalog = JSON.parse(
  await readFile(
    new URL("../public/capsule/catalog.json", import.meta.url),
    "utf8",
  ),
);
const fetcher: typeof fetch = async (input) =>
  new Response(
    await readFile(
      new URL(
        "../public/capsule" + new URL(String(input)).pathname,
        import.meta.url,
      ),
    ),
  );
const point = (mesh: THREE.Mesh, index: number) =>
  mesh
    .getVertexPosition(index, new THREE.Vector3())
    .applyMatrix4(mesh.matrixWorld);
function owner(node: THREE.Object3D): string {
  for (let parent: THREE.Object3D | null = node; parent; parent = parent.parent)
    if (parent.userData.assetId) return parent.userData.assetId;
  return "";
}

test("original Snap Salute is a reproducible bounded nonlooping clip on the unchanged bone order", () => {
  assert.deepEqual(snapSaluteData.bones, performanceData.bones);
  assert.deepEqual(
    emoteDescriptors.find((entry) => entry.id === "snap-salute"),
    { id: "snap-salute", label: "Snap salute", duration: 2.4, loop: false },
  );
  assert.equal(snapSaluteData.clip.source.kind, "original");
  assert.equal(snapSaluteData.clip.frames.length, 145);
  for (const frame of snapSaluteData.clip.frames) {
    assert.ok(
      [...frame.root, ...frame.rotations, frame.time, frame.support].every(
        Number.isFinite,
      ),
    );
    for (let bone = 0; bone < 15; bone++)
      assert.ok(
        Math.abs(
          Math.hypot(...frame.rotations.slice(bone * 4, bone * 4 + 4)) - 1,
        ) < 2e-7,
      );
  }
  const first = samplePerformance("snap-salute", 0),
    last = samplePerformance("snap-salute", 2.4);
  for (const [name, quaternion] of first.rotations)
    assert.ok(quaternion.angleTo(last.rotations.get(name)!) < 1e-7);
  assert.deepEqual(first.root.toArray(), [0, 0, 0]);
  assert.deepEqual(last.root.toArray(), [0, 0, 0]);
});

test("Snap Salute preserves actual skin continuity, shoe support, bone lengths and recipe across three builds and three tops", async () => {
  const library = new AvatarLibrary(catalog, "https://salute.test/", fetcher);
  let snapshots = 0;
  try {
    for (const weight of [-1, 0, 1])
      for (const shirt of ["shirt-jersey", "shirt-circuit", "shirt-relay"]) {
        const avatar = library.create(),
          recipe = defaultRecipe(catalog);
        recipe.body = { weight };
        recipe.parts.shirt = shirt;
        recipe.parts.hair = "hair-volt";
        try {
          await avatar.setAppearance(recipe);
          avatar.update(0);
          const view = avatar.attachmentView()!;
          const rest = [...view.sockets.values()].map((bone) => ({
            bone,
            position: bone.position.clone(),
            scale: bone.scale.clone(),
          }));
          const surfaces: {
            mesh: THREE.Mesh;
            edges: { a: number; b: number; limit: number }[];
          }[] = [];
          const shoes: THREE.Mesh[] = [];
          avatar.object.traverseVisible((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            if (owner(node) === recipe.parts.shoes) shoes.push(node);
            if (!(node instanceof THREE.SkinnedMesh)) return;
            const g = node.geometry,
              indices = g.index,
              positions = g.attributes.position;
            const points = Array.from({ length: positions.count }, (_, i) =>
              point(node, i),
            );
            const edges = new Map<
              string,
              { a: number; b: number; limit: number }
            >();
            for (
              let triangle = 0;
              triangle < (indices?.count ?? positions.count);
              triangle += 3
            )
              for (let edge = 0; edge < 3; edge++) {
                const a = indices?.getX(triangle + edge) ?? triangle + edge,
                  b =
                    indices?.getX(triangle + ((edge + 1) % 3)) ??
                    triangle + ((edge + 1) % 3);
                edges.set(`${Math.min(a, b)}:${Math.max(a, b)}`, {
                  a,
                  b,
                  limit: points[a].distanceTo(points[b]) * 3 + 0.02,
                });
              }
            surfaces.push({ mesh: node, edges: [...edges.values()] });
          });
          let minFloor = Infinity,
            maxExcess = -Infinity,
            maxSlide = 0;
          const footBefore = ["foot_L", "foot_R"].map((name) =>
            view.sockets.get(name)!.getWorldPosition(new THREE.Vector3()),
          );
          for (let frame = 0; frame <= 144; frame++) {
            avatar.update(frame / 60, {
              emote: { id: "snap-salute", elapsed: frame / 60 },
            });
            avatar.object.updateMatrixWorld(true);
            for (const { bone, position, scale } of rest) {
              assert.ok(bone.position.distanceTo(position) < 1e-10);
              assert.ok(bone.scale.distanceTo(scale) < 1e-10);
            }
            for (const mesh of shoes)
              for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
                minFloor = Math.min(minFloor, point(mesh, i).y);
            if (frame % 4 === 0) {
              for (const { mesh, edges } of surfaces) {
                const points = Array.from(
                  { length: mesh.geometry.attributes.position.count },
                  (_, i) => point(mesh, i),
                );
                assert.ok(
                  points.every((p) => p.toArray().every(Number.isFinite)),
                );
                for (const edge of edges)
                  maxExcess = Math.max(
                    maxExcess,
                    points[edge.a].distanceTo(points[edge.b]) - edge.limit,
                  );
              }
              snapshots++;
            }
            for (const [i, name] of ["foot_L", "foot_R"].entries()) {
              const now = view.sockets
                .get(name)!
                .getWorldPosition(new THREE.Vector3());
              maxSlide = Math.max(
                maxSlide,
                Math.hypot(now.x - footBefore[i].x, now.z - footBefore[i].z),
              );
            }
          }
          console.log({ shirt, weight, minFloor, maxExcess, maxSlide });
          assert.ok(maxSlide < 1e-6, `foot transition slide ${maxSlide}`);
          assert.ok(
            minFloor > -0.002,
            `${shirt} weight ${weight}: shoe floor ${minFloor}`,
          );
          assert.ok(
            maxExcess < 0.001,
            `${shirt} weight ${weight}: skin continuity excess ${maxExcess}`,
          );
          assert.deepEqual(avatar.recipe, recipe);
        } finally {
          avatar.dispose();
        }
      }
    assert.equal(snapshots, 333);
  } finally {
    library.dispose();
  }
});

test("Snap Salute stows and restores real equipment, cancels on movement, and has a static reduced-motion pose", async () => {
  for (const shared of [false, true]) {
    const s = await createPerformanceFixture();
    try {
      await s.controller.setLoadout(
        shared ? s.shared() : s.loadout(null, "wield-doodle-rocket"),
      );
      const loadout = s.controller.loadout,
        held = s.controller.getHand("right")!.object;
      s.avatar.playEmote("snap-salute");
      let played = false;
      for (let i = 0; i < 330; i++) {
        s.tick();
        const state = s.avatar.animationDiagnostics().emote;
        played ||= state?.id === "snap-salute" && state.weight > 0.95;
      }
      assert.ok(played);
      assert.equal(s.avatar.animationDiagnostics().emote, undefined);
      assert.equal(s.controller.getHand("right")!.object, held);
      assert.deepEqual(s.controller.loadout, loadout);
      assert.ok(s.controller.isDrawn());
      assert.ok(s.gripError() < 1e-5);
      assert.deepEqual(s.events, []);
      s.avatar.playEmote("snap-salute");
      for (let i = 0; i < 100; i++) s.tick();
      for (let i = 0; i < 30; i++) s.tick({ velocity: { x: 0, z: 2 } });
      assert.equal(s.avatar.animationDiagnostics().emote, undefined);
    } finally {
      s.dispose();
    }
  }
  const s = await createPerformanceFixture();
  try {
    const poses: number[][] = [];
    for (const elapsed of [0.3, 0.8, 1.6]) {
      s.tick({ reducedMotion: true, emote: { id: "snap-salute", elapsed } });
      poses.push(
        s.avatar
          .attachmentView()!
          .sockets.get("hand_R")!
          .getWorldPosition(new THREE.Vector3())
          .toArray(),
      );
    }
    assert.deepEqual(poses[0], poses[1]);
    assert.deepEqual(poses[1], poses[2]);
    s.tick({ reducedMotion: true, emote: { id: "snap-salute", elapsed: 2.4 } });
    assert.equal(s.avatar.animationDiagnostics().emote, undefined);
  } finally {
    s.dispose();
  }
});
