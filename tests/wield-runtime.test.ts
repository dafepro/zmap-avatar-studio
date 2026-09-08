import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { AvatarLibrary } from "../src/runtime";
import { ComicStyle } from "../src/comic";
import { defaultRecipe, type Catalog, type Asset } from "../src/core";
import {
  emptyWieldLoadout,
  type WieldCatalog,
  type Hand,
} from "../src/wield-core";
import {
  WieldLibrary,
  WieldController,
  isWieldHandCovered,
  type WieldBehaviorRegistry,
  type WieldEvent,
} from "../src/wield-runtime";
import "./helpers/node-image";

function glb(nodes: any[], sceneNodes: number[]) {
  const positions = new Float32Array([0, 0, 0, 0.02, 0, 0, 0, 0.02, 0]);
  nodes = structuredClone(nodes);
  let meshCount = 0;
  for (const node of nodes)
    if (node.mesh !== undefined) node.mesh = meshCount++;
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes: Array.from({ length: meshCount }, () => ({
      primitives: [{ attributes: { POSITION: 0 }, material: 0 }],
    })),
    materials: [
      {
        name: "skin",
        pbrMetallicRoughness: { baseColorFactor: [0.5, 0.3, 0.2, 1] },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [0.02, 0.02, 0],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
    ],
    buffers: [{ byteLength: positions.byteLength }],
  };
  let text = JSON.stringify(json);
  text += " ".repeat((4 - (text.length % 4)) % 4);
  const data = new Uint8Array(28 + text.length + positions.byteLength),
    view = new DataView(data.buffer);
  for (const [offset, value] of [
    [0, 0x46546c67],
    [4, 2],
    [8, data.length],
    [12, text.length],
    [16, 0x4e4f534a],
    [20 + text.length, positions.byteLength],
    [24 + text.length, 0x004e4942],
  ])
    view.setUint32(offset, value, true);
  data.set(new TextEncoder().encode(text), 20);
  data.set(new Uint8Array(positions.buffer), 28 + text.length);
  return data;
}
function setup(
  options: {
    delay?: (id: string) => Promise<void>;
    fail?: (id: string) => boolean;
    mutateItem?: (nodes: any[]) => void;
  } = {},
) {
  const files = new Map<string, Uint8Array>(),
    fetches = new Map<string, number>();
  const describe = (id: string, bytes: Uint8Array, triangles: number) => {
    files.set(id, bytes);
    return {
      id,
      label: id,
      url: `models/${id}.glb`,
      node: id,
      bytes: bytes.length,
      triangles,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const bodyBytes = glb(
    [
      { name: "body", mesh: 0 },
      { name: "relaxed-left", mesh: 0, extras: { handSide: "left" } },
      { name: "relaxed-right", mesh: 0, extras: { handSide: "right" } },
    ],
    [0, 1, 2],
  );
  const body: Asset = {
    ...describe("body", bodyBytes, 3),
    slot: "body",
    rig: "test-rig",
    description: "Body",
    channels: ["skin"],
    tags: [],
    attachments: [
      { node: "body", socket: "root" },
      { node: "relaxed-left", socket: "hand_L" },
      { node: "relaxed-right", socket: "hand_R" },
    ],
  };
  const catalog: Catalog = {
    version: 1,
    id: "avatar",
    revision: "1.0.0",
    rig: {
      id: "test-rig",
      height: 2,
      sockets: [
        { id: "root", parent: null, position: [0, 0, 0] },
        ...(["L", "R"] as const).flatMap((side) => [
          {
            id: `arm_${side}`,
            parent: "root",
            position: [side === "L" ? -0.2 : 0.2, 1.5, 0] as [
              number,
              number,
              number,
            ],
          },
          {
            id: `forearm_${side}`,
            parent: `arm_${side}`,
            position: [0, -0.3, 0] as [number, number, number],
          },
          {
            id: `hand_${side}`,
            parent: `forearm_${side}`,
            position: [0, -0.25, 0] as [number, number, number],
          },
        ]),
      ],
    },
    base: "body",
    assets: [body],
    channels: ["skin"],
    slots: [{ id: "hat", label: "Hat", required: false }],
    budgets: { maxBytes: 100000, maxTriangles: 14000, maxParts: 2 },
  };
  const grip = (hand: Hand) => ({
    ...describe(
      `grip-${hand}`,
      glb([{ name: `grip-${hand}`, mesh: 0, extras: { handSide: hand } }], [0]),
      1,
    ),
    hand,
    frame: {
      position: [hand === "left" ? -0.024 : 0.024, -0.073, 0.046] as [
        number,
        number,
        number,
      ],
      rotation: [
        Math.PI / 2,
        0,
        hand === "left" ? Math.PI / 2 : -Math.PI / 2,
      ] as [number, number, number],
    },
  });
  const item = (id: string) => {
    const nodes = [
      { name: id, children: [1, 2], mesh: 0 },
      {
        name: `${id}-grip`,
        translation: [0.04, -0.02, 0.07],
        rotation: new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(0.3, 0.8, -0.4))
          .toArray(),
      },
      { name: `${id}-tip`, translation: [0, 0.15, 0] },
    ];
    options.mutateItem?.(nodes);
    const pose = (side: number) => ({
      arm: [-0.1, 0, side * 0.1] as [number, number, number],
      forearm: [-1.15, 0, 0] as [number, number, number],
      wrist: [0, (-side * Math.PI) / 2, 0] as [number, number, number],
    });
    return {
      ...describe(id, glb(nodes, [0]), 1),
      behavior: "tool",
      gripAnchor: `${id}-grip`,
      anchors: { tip: `${id}-tip` },
      pose: { left: pose(-1), right: pose(1) },
    };
  };
  const wield: WieldCatalog = {
    version: 1,
    id: "equipment",
    revision: "1.0.0",
    rig: "test-rig",
    grips: { left: grip("left"), right: grip("right") },
    items: [item("wand"), item("flower"), item("slow")],
  };
  const fetcher: typeof fetch = async (input) => {
    const id = String(input).split("/").pop()!.replace(".glb", "");
    fetches.set(id, (fetches.get(id) ?? 0) + 1);
    await options.delay?.(id);
    return options.fail?.(id)
      ? new Response("failed", { status: 503 })
      : new Response(new Uint8Array(files.get(id)!));
  };
  const avatars = new AvatarLibrary(catalog, "https://assets.test/", fetcher),
    library = new WieldLibrary(wield, "https://assets.test/", fetcher);
  const avatar = avatars.create(),
    recipe = defaultRecipe(catalog);
  const registry: WieldBehaviorRegistry = {
    tool: { requiredAnchors: ["tip"], create: () => ({}) },
  };
  const loadout = (left: string | null, right: string | null) => ({
    ...emptyWieldLoadout(wield),
    left,
    right,
  });
  return {
    avatars,
    library,
    avatar,
    recipe,
    registry,
    loadout,
    fetches,
    files,
    wield,
  };
}
function mesh(root: THREE.Object3D) {
  let found!: THREE.Mesh;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) found ??= o;
  });
  return found;
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

test("same item in both hands has independent resources, input, exact proper grip frames, and one fetch", async () => {
  const s = setup(),
    inputs: Record<string, string[]> = { left: [], right: [] },
    events: WieldEvent[] = [];
  await s.avatar.setAppearance(s.recipe);
  const controller = new WieldController(
    s.avatar,
    s.library,
    {
      tool: {
        requiredAnchors: ["tip"],
        create: (ctx) => ({
          input(event) {
            inputs[ctx.hand].push(event.type);
            if (event.type === "press")
              ctx.emit({ type: "use", anchor: "tip" });
          },
        }),
      },
    },
    { onEvent: (e) => events.push(e) },
  );
  await controller.setLoadout(s.loadout("wand", "wand"));
  assert.equal(s.fetches.get("wand"), 1);
  const left = controller.getHand("left")!,
    right = controller.getHand("right")!;
  assert.notEqual(mesh(left.object).geometry, mesh(right.object).geometry);
  assert.notEqual(mesh(left.object).material, mesh(right.object).material);
  controller.press("left");
  controller.press("left");
  s.avatar.object.position.set(3, 0.5, -2);
  s.avatar.object.rotation.y = 0.6;
  s.avatar.update(1, { gesture: "wave" });
  assert.deepEqual(inputs.left, ["press"]);
  assert.deepEqual(inputs.right, []);
  assert.equal(events.length, 1);
  assert.equal(events[0].hand, "left");
  assert.ok(events[0].position?.every(Number.isFinite));
  for (const hand of ["left", "right"] as const) {
    const frame = s.wield.grips[hand].frame,
      wrist = s.avatar
        .attachmentView()!
        .sockets.get(hand === "left" ? "hand_L" : "hand_R")!;
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
    const actual = controller.getHand(hand)!.anchor("grip").matrixWorld;
    assert.ok(
      actual.elements.every(
        (value, i) => Math.abs(value - expected.elements[i]) < 1e-6,
      ),
    );
    assert.ok(controller.getHand(hand)!.object.scale.x > 0);
  }
  assert.deepEqual(controller.diagnostics(), {
    state: "ready",
    visible: true,
    appearanceTriangles: 3,
    heldTriangles: 4,
    visibleTriangles: 5,
    effectTriangles: 0,
    replacedTriangles: 2,
    heldBytes:
      s.wield.items[0].bytes * 2 +
      s.wield.grips.left.bytes +
      s.wield.grips.right.bytes,
    equippedHands: 2,
  });
  controller.release("left");
  controller.release("left");
  assert.deepEqual(inputs.left, ["press", "release"]);
  controller.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("atomic replacement keeps both ready items on failure and latest request wins without transferring pressed input", async () => {
  const gate = deferred();
  let broken = true;
  const s = setup({
    delay: async (id) => {
      if (id === "slow") await gate.promise;
    },
    fail: (id) => id === "flower" && broken,
  });
  await s.avatar.setAppearance(s.recipe);
  const controller = new WieldController(s.avatar, s.library, s.registry);
  await controller.setLoadout(s.loadout("wand", "wand"));
  const left = controller.getHand("left"),
    right = controller.getHand("right");
  const slow = controller.setLoadout(s.loadout("slow", null));
  assert.equal(controller.state, "loading");
  controller.press("left");
  await assert.rejects(
    controller.setLoadout(s.loadout("wand", "flower")),
    /could not load/,
  );
  assert.equal(controller.getHand("left"), left);
  assert.equal(controller.getHand("right"), right);
  broken = false;
  await controller.setLoadout(s.loadout(null, "flower"));
  gate.release();
  assert.equal(await slow, false);
  assert.equal(controller.getHand("left"), undefined);
  assert.equal(controller.getHand("right")!.item.id, "flower");
  controller.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("appearance swaps preserve stable equipment ports, restore hand visibility, and dispose owned geometry exactly once", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const initial = s.avatar.attachmentView()!,
    handMeshes: THREE.Mesh[] = [];
  initial.root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.userData.handSide)
      handMeshes.push(node);
  });
  handMeshes.find((node) => node.userData.handSide === "right")!.visible =
    false;
  const controller = new WieldController(s.avatar, s.library, s.registry);
  assert.throws(
    () => new WieldController(s.avatar, s.library, s.registry),
    /already has/,
  );
  await controller.setLoadout(s.loadout("wand", "wand"));
  const left = controller.getHand("left")!,
    geometry = mesh(left.object).geometry;
  let destroyed = 0;
  geometry.addEventListener("dispose", () => destroyed++);
  await s.avatar.setAppearance({ ...s.recipe, colors: { skin: "#eeaa88" } });
  assert.equal(destroyed, 0);
  assert.equal(controller.getHand("left"), left);
  assert.notEqual(s.avatar.attachmentView()!.root, initial.root);
  assert.equal(
    handMeshes.find((node) => node.userData.handSide === "left")!.visible,
    true,
  );
  assert.equal(
    handMeshes.find((node) => node.userData.handSide === "right")!.visible,
    false,
  );
  assert.ok(s.avatar.object.children[0].getObjectById(left.object.id));
  s.avatar.update(2, { gesture: "walk" });
  assert.equal(
    (
      mesh(left.grip).material as THREE.MeshStandardMaterial
    ).color.getHexString(),
    "eeaa88",
  );
  let beforeDispose = 0;
  mesh(left.object).userData.beforeAvatarDispose = () => beforeDispose++;
  s.avatar.dispose();
  controller.dispose();
  s.avatars.dispose();
  s.library.dispose();
  assert.equal(destroyed, 1);
  assert.equal(beforeDispose, 1);
  assert.equal(controller.state, "disposed");
});

test("missing semantic hands or nonrigid/missing anchors fail before replacement", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const controller = new WieldController(s.avatar, s.library, s.registry);
  s.avatar.object.traverse((node) => {
    if (node instanceof THREE.Mesh) delete node.userData.handSide;
  });
  await assert.rejects(
    controller.setLoadout(s.loadout("wand", null)),
    /semantic replaceable/,
  );
  assert.equal(controller.getHand("left"), undefined);
  controller.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
  for (const modify of [
    (nodes: any[]) => (nodes[1].name = "missing"),
    (nodes: any[]) => (nodes[1].scale = [-1, 1, 1]),
  ]) {
    const t = setup({ mutateItem: modify });
    await t.avatar.setAppearance(t.recipe);
    const c = new WieldController(t.avatar, t.library, t.registry);
    await assert.rejects(c.setLoadout(t.loadout("wand", null)), /anchor|frame/);
    c.dispose();
    t.avatar.dispose();
    t.avatars.dispose();
    t.library.dispose();
  }
});

test("disposal during an async load cannot resurrect equipment or retain an avatar lease", async () => {
  const gate = deferred(),
    s = setup({
      delay: async (id) => {
        if (id === "slow") await gate.promise;
      },
    });
  await s.avatar.setAppearance(s.recipe);
  const controller = new WieldController(s.avatar, s.library, s.registry),
    loading = controller.setLoadout(s.loadout("slow", "wand"));
  controller.dispose();
  gate.release();
  assert.equal(await loading, false);
  assert.equal(controller.getHand("left"), undefined);
  const next = new WieldController(s.avatar, s.library, s.registry);
  next.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("paused, nonfinite, and interrupted clocks cancel input; behavior faults are isolated and effects bounded", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const inputs: Record<string, string[]> = { left: [], right: [] },
    errors: unknown[] = [],
    frames: number[] = [];
  const c = new WieldController(
    s.avatar,
    s.library,
    {
      tool: {
        create: (ctx) => ({
          input: (e) => inputs[ctx.hand].push(e.type),
          update: (frame) => {
            frames.push(frame.dt);
            if (ctx.hand === "left" && frame.elapsed > 0.2)
              throw Error("left broke");
          },
        }),
      },
    },
    { onError: (error) => errors.push(error) },
  );
  await c.setLoadout(s.loadout("wand", "wand"));
  c.press("left");
  c.setPaused(true);
  c.press("right");
  s.avatar.update(1);
  assert.deepEqual(inputs.left, ["press", "cancel"]);
  assert.deepEqual(inputs.right, ["cancel"]);
  c.setPaused(false);
  c.press("right");
  s.avatar.update(2);
  assert.equal(inputs.right.at(-1), "cancel");
  c.press("right");
  s.avatar.update(NaN);
  assert.equal(inputs.right.at(-1), "cancel");
  s.avatar.update(2.1);
  s.avatar.update(2.2);
  s.avatar.update(2.3);
  assert.equal(c.getHand("left")!.state, "error");
  assert.equal(c.getHand("right")!.state, "ready");
  assert.equal(errors.length, 1);
  assert.ok(frames.every((dt) => Number.isFinite(dt) && dt >= 0 && dt <= 0.1));
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
  const t = setup();
  await t.avatar.setAppearance(t.recipe);
  const over = new WieldController(t.avatar, t.library, {
    tool: {
      create: (ctx) => {
        ctx.effects.add(
          new THREE.Mesh(
            new THREE.SphereGeometry(1, 30, 20),
            new THREE.MeshBasicMaterial(),
          ),
        );
        return {};
      },
    },
  });
  await assert.rejects(
    over.setLoadout(t.loadout("wand", null)),
    /effect triangle budget/,
  );
  assert.equal(over.getHand("left"), undefined);
  over.dispose();
  t.avatar.dispose();
  t.avatars.dispose();
  t.library.dispose();
});

test("unknown behavior and logical anchors fail explicitly; event storms fail their own hand", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  assert.throws(
    () => new WieldController(s.avatar, s.library, {}),
    /Unregistered/,
  );
  assert.throws(
    () =>
      new WieldController(s.avatar, s.library, {
        tool: { requiredAnchors: ["missing"], create: () => ({}) },
      }),
    /Missing declared/,
  );
  const c = new WieldController(s.avatar, s.library, {
    tool: {
      create: (ctx) => ({
        input(event) {
          if (event.type === "press" && ctx.hand === "left")
            for (let i = 0; i < 40; i++) ctx.emit({ type: "spam" });
        },
      }),
    },
  });
  await c.setLoadout(s.loadout("wand", "wand"));
  c.press("left");
  assert.equal(c.getHand("left")!.state, "error");
  assert.equal(c.getHand("right")!.state, "ready");
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("behavior grip mutations are restored and inactive instance allocations cannot bypass effects limits", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const c = new WieldController(s.avatar, s.library, {
    tool: {
      create: (ctx) => ({
        update() {
          if (ctx.hand === "left") ctx.anchor("grip").position.x += 0.5;
        },
      }),
    },
  });
  await c.setLoadout(s.loadout("wand", "wand"));
  const anchor = c.getHand("left")!.anchor("grip"),
    rest = anchor.position.clone();
  s.avatar.update(1);
  assert.equal(c.getHand("left")!.state, "error");
  assert.equal(c.getHand("right")!.state, "ready");
  assert.ok(anchor.position.equals(rest));
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
  const t = setup();
  await t.avatar.setAppearance(t.recipe);
  let disposedInstances = 0;
  const over = new WieldController(t.avatar, t.library, {
    tool: {
      create: (ctx) => {
        const pool = new THREE.InstancedMesh(
          new THREE.BoxGeometry(),
          new THREE.MeshBasicMaterial(),
          100,
        );
        pool.count = 0;
        pool.addEventListener("dispose", () => disposedInstances++);
        ctx.effects.add(pool);
        return {};
      },
    },
  });
  await assert.rejects(
    over.setLoadout(t.loadout("wand", null)),
    /effect triangle budget/,
  );
  assert.equal(
    disposedInstances,
    1,
    "controller releases instance buffers even after staging rejection",
  );
  over.dispose();
  t.avatar.dispose();
  t.avatars.dispose();
  t.library.dispose();
});

test("appearance candidate failure leaves equipment and old assembly intact; item integrity errors can retry", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const c = new WieldController(s.avatar, s.library, s.registry);
  await c.setLoadout(s.loadout("wand", null));
  const oldRoot = s.avatar.object.children[0],
    oldHand = c.getHand("left");
  const assemble = s.avatars.assemble.bind(s.avatars);
  s.avatars.assemble = async (recipe) => {
    const result = await assemble(recipe);
    result.root.traverse((node) => {
      if (node instanceof THREE.Mesh) delete node.userData.handSide;
    });
    return result;
  };
  await assert.rejects(
    s.avatar.setAppearance(s.recipe),
    /semantic replaceable/,
  );
  assert.equal(s.avatar.object.children[0], oldRoot);
  assert.equal(c.getHand("left"), oldHand);
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
  const t = setup();
  await t.avatar.setAppearance(t.recipe);
  const original = t.files.get("wand")!,
    corrupt = original.slice();
  // Keep valid GLB syntax but modify a binary vertex to prove hash verification.
  corrupt[corrupt.length - 8] ^= 1;
  t.files.set("wand", corrupt);
  const integrity = new WieldController(t.avatar, t.library, t.registry);
  await assert.rejects(
    integrity.setLoadout(t.loadout("wand", null)),
    /approved asset/,
  );
  t.files.set("wand", original);
  assert.equal(await integrity.setLoadout(t.loadout("wand", null)), true);
  assert.equal(t.fetches.get("wand"), 2);
  integrity.dispose();
  t.avatar.dispose();
  t.avatars.dispose();
  t.library.dispose();
});

test("equal input/time sequences are deterministic and event sequence belongs to its triggering input", async () => {
  async function run() {
    const s = setup();
    await s.avatar.setAppearance(s.recipe);
    const events: WieldEvent[] = [],
      elapsed: number[] = [];
    const c = new WieldController(
      s.avatar,
      s.library,
      {
        tool: {
          create: (ctx) => ({
            input(e) {
              if (e.type === "press") ctx.emit({ type: "use", anchor: "tip" });
            },
            pose(frame) {
              return { wrist: [0, Math.sin(frame.elapsed) * 0.2, 0] };
            },
            update(frame) {
              elapsed.push(frame.elapsed);
            },
          }),
        },
      },
      { onEvent: (event) => events.push(event) },
    );
    await c.setLoadout(s.loadout("wand", null));
    c.press("left");
    c.release("left");
    for (const time of [0, 0.04, 0.1, 0.16, 0.22]) s.avatar.update(time);
    const matrix = c
      .getHand("left")!
      .anchor("grip")
      .matrixWorld.elements.slice();
    c.dispose();
    s.avatar.dispose();
    s.avatars.dispose();
    s.library.dispose();
    return { events, elapsed, matrix };
  }
  const a = await run(),
    b = await run();
  assert.deepEqual(a, b);
  assert.equal(a.events.length, 1);
  assert.equal(a.events[0].sequence, 1);
});

test("illustrated grip pigmentation survives appearance recolor and restoring source materials", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const controller = new WieldController(s.avatar, s.library, s.registry);
  await controller.setLoadout(s.loadout("wand", "wand"));
  const style = new ComicStyle();
  style.update(s.avatar.object.children[0], new THREE.Vector2(800, 600));
  const hand = controller.getHand("left")!,
    handMesh = mesh(hand.grip);
  let sourceDisposed = 0;
  const source = handMesh.userData.beforeAvatarDispose as Function;
  assert.equal(typeof source, "function");
  await s.avatar.setAppearance({ ...s.recipe, colors: { skin: "#c58763" } });
  style.update(s.avatar.object.children[0], new THREE.Vector2(800, 600));
  style.clear(true);
  assert.equal(
    (handMesh.material as THREE.MeshBasicMaterial).color.getHexString(),
    "c58763",
  );
  (handMesh.material as THREE.Material).addEventListener(
    "dispose",
    () => sourceDisposed++,
  );
  style.update(s.avatar.object.children[0], new THREE.Vector2(800, 600));
  controller.dispose();
  style.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
  assert.equal(sourceDisposed, 1);
});

test("runtime geometry overflow retires only its failing visual and restores its own relaxed hand", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  let illegal: THREE.Mesh | undefined,
    disposed = 0;
  const c = new WieldController(s.avatar, s.library, {
    tool: {
      create: (ctx) => ({
        update() {
          if (ctx.hand === "left" && !illegal) {
            illegal = new THREE.Mesh(
              new THREE.SphereGeometry(1, 30, 20),
              new THREE.MeshBasicMaterial(),
            );
            illegal.geometry.addEventListener("dispose", () => disposed++);
            ctx.object.add(illegal);
          }
        },
      }),
    },
  });
  await c.setLoadout(s.loadout("wand", "wand"));
  s.avatar.update(1);
  assert.equal(c.getHand("left")!.state, "error");
  assert.equal(c.getHand("right")!.state, "ready");
  assert.equal(disposed, 1);
  assert.equal(c.getHand("left")!.object.parent, null);
  const visibility: Record<string, boolean> = {};
  s.avatar.object.traverse((node) => {
    if (node instanceof THREE.Mesh && node.userData.handSide)
      visibility[node.userData.handSide] = node.visible;
  });
  assert.equal(visibility.left, true);
  assert.equal(c.diagnostics().equippedHands, 1);
  await s.avatar.setAppearance(s.recipe);
  s.avatar.update(2);
  assert.equal(
    c.getHand("left")!.object.parent,
    null,
    "an appearance swap must not resurrect failed equipment",
  );
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
  assert.equal(disposed, 1);
});

test("inspection visibility restores base hands/poses across swaps without losing held state or overriding explicit pause", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const originalRight = s.avatar.attachmentView()!.sockets.get("hand_R")!;
  originalRight.traverse((node) => {
    if (node instanceof THREE.Mesh) node.visible = false;
  });
  const events: WieldEvent[] = [],
    times: number[] = [];
  let lit = false;
  const c = new WieldController(
    s.avatar,
    s.library,
    {
      tool: {
        create: (ctx) => ({
          input(event) {
            if (event.type === "press") {
              lit = !lit;
              ctx.emit({ type: "light", value: lit ? 1 : 0 });
            }
          },
          update(frame) {
            times.push(frame.elapsed);
          },
        }),
      },
    },
    { onEvent: (event) => events.push(event) },
  );
  await c.setLoadout(s.loadout("wand", "wand"));
  c.press("left");
  s.avatar.update(1);
  c.release("left");
  const left = c.getHand("left")!,
    right = c.getHand("right")!;
  assert.equal(lit, true);
  assert.equal(events.length, 1);
  c.press("right"); // A queued event cannot escape after inspection hides equipment.
  const retained = lit;
  c.setVisible(false);
  assert.equal(left.object.parent?.parent, null);
  assert.equal(c.diagnostics().visible, false);
  assert.equal(
    c.diagnostics().visibleTriangles,
    2,
    "original hidden right hand remains hidden",
  );
  assert.equal(
    s.avatar.attachmentView()!.sockets.get("forearm_L")!.rotation.x,
    -0.1,
  );
  const updatesBefore = times.length;
  c.press("left");
  s.avatar.update(1.1);
  s.avatar.update(1.2);
  assert.equal(times.length, updatesBefore);
  assert.equal(events.length, 1);
  assert.equal(lit, retained);
  await s.avatar.setAppearance({ ...s.recipe, colors: { skin: "#e1b394" } });
  s.avatar.update(1.3, { gesture: "wave" });
  assert.equal(c.getHand("left"), left);
  assert.equal(c.getHand("right"), right);
  assert.equal(
    s.avatar.attachmentView()!.sockets.get("arm_R")!.rotation.x,
    -2.7,
  );
  c.setPaused(true);
  c.setVisible(true);
  assert.equal(c.getHand("left"), left);
  assert.equal(c.getHand("right"), right);
  assert.ok(s.avatar.object.children[0].getObjectById(left.object.id));
  assert.equal(lit, retained);
  c.press("left");
  s.avatar.update(1.4);
  assert.equal(
    lit,
    retained,
    "showing equipment must not unpause explicit input",
  );
  assert.equal(
    times.at(-1),
    0,
    "hidden and explicitly paused time do not accumulate",
  );
  c.setVisible(false);
  c.setPaused(false);
  c.setVisible(true);
  c.press("left");
  s.avatar.update(1.5);
  assert.notEqual(lit, retained);
  assert.equal(events.length, 2);
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("input sequences survive re-equipping and event IDs distinguish multiple intents for the same input", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const inputs: number[] = [],
    events: WieldEvent[] = [];
  const c = new WieldController(
    s.avatar,
    s.library,
    {
      tool: {
        create: (ctx) => ({
          input(event) {
            inputs.push(event.sequence);
            if (event.type === "press") {
              ctx.emit({ type: "stroke", anchor: "tip" });
              ctx.emit({ type: "stroke", anchor: "tip" });
            }
          },
        }),
      },
    },
    { onEvent: (event) => events.push(event) },
  );
  await c.setLoadout(s.loadout("wand", null));
  c.press("left");
  s.avatar.update(1);
  c.release("left");
  await c.setLoadout(s.loadout(null, null));
  await c.setLoadout(s.loadout("wand", null));
  c.press("left");
  s.avatar.update(1.1);
  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((event) => event.eventId),
    [1, 2, 3, 4],
  );
  assert.equal(events[0].sequence, events[1].sequence);
  assert.equal(events[2].sequence, events[3].sequence);
  assert.ok(events[2].sequence > events[0].sequence);
  assert.ok(inputs.every((sequence, i) => i === 0 || sequence > inputs[i - 1]));
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("changing one hand preserves the other ready owner, pressed state and toggles; identical ready loadouts are no-ops", async () => {
  const s = setup({ fail: (id) => id === "slow" });
  await s.avatar.setAppearance(s.recipe);
  const creations = { left: 0, right: 0 },
    leftInputs: string[] = [];
  let leftPressed = false,
    lit = false;
  const c = new WieldController(s.avatar, s.library, {
    tool: {
      create: (ctx) => {
        creations[ctx.hand]++;
        return {
          input(event) {
            if (ctx.hand === "left") {
              leftInputs.push(event.type);
              if (event.type === "press") lit = !lit;
            }
          },
          update(frame) {
            if (ctx.hand === "left") leftPressed = frame.pressed;
          },
        };
      },
    },
  });
  await c.setLoadout(s.loadout("wand", "wand"));
  c.press("left");
  s.avatar.update(0);
  const left = c.getHand("left")!,
    right = c.getHand("right")!;
  let disposals = 0;
  mesh(left.object).geometry.addEventListener("dispose", () => disposals++);
  await c.setLoadout(s.loadout("wand", "wand"));
  assert.equal(c.getHand("left"), left);
  assert.equal(c.getHand("right"), right);
  assert.deepEqual(creations, { left: 1, right: 1 });
  await c.setLoadout(s.loadout("wand", "flower"));
  s.avatar.update(0.1);
  assert.equal(c.getHand("left"), left);
  assert.notEqual(c.getHand("right"), right);
  assert.equal(leftPressed, true);
  assert.equal(lit, true);
  assert.deepEqual(leftInputs, ["press"]);
  assert.equal(disposals, 0);
  await assert.rejects(
    c.setLoadout(s.loadout("wand", "slow")),
    /could not load/,
  );
  assert.equal(c.getHand("left"), left);
  assert.equal(disposals, 0);
  assert.deepEqual(leftInputs, ["press"]);
  c.dispose();
  assert.equal(disposals, 1);
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("an errored same-ID hand retries while unchanged good hands remain live", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  let failLeft = true;
  const c = new WieldController(s.avatar, s.library, {
    tool: {
      create: (ctx) => ({
        update() {
          if (ctx.hand === "left" && failLeft) throw Error("first left fails");
        },
      }),
    },
  });
  await c.setLoadout(s.loadout("wand", "wand"));
  s.avatar.update(0);
  const failed = c.getHand("left")!,
    right = c.getHand("right")!;
  assert.equal(failed.state, "error");
  failLeft = false;
  await c.setLoadout(s.loadout("wand", "wand"));
  s.avatar.update(0.1);
  assert.notEqual(c.getHand("left"), failed);
  assert.equal(c.getHand("left")!.state, "ready");
  assert.equal(c.getHand("right"), right);
  c.dispose();
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("superseded partial equipment requests never dispose their borrowed ready hand", async () => {
  const gate = deferred(),
    s = setup({
      delay: async (id) => {
        if (id === "slow") await gate.promise;
      },
    });
  await s.avatar.setAppearance(s.recipe);
  const c = new WieldController(s.avatar, s.library, s.registry);
  await c.setLoadout(s.loadout("wand", "wand"));
  const left = c.getHand("left")!;
  let disposed = 0;
  mesh(left.object).geometry.addEventListener("dispose", () => disposed++);
  const stale = c.setLoadout(s.loadout("wand", "slow"));
  await c.setLoadout(s.loadout("wand", "flower"));
  gate.release();
  assert.equal(await stale, false);
  assert.equal(c.getHand("left"), left);
  assert.equal(disposed, 0);
  c.dispose();
  assert.equal(disposed, 1);
  s.avatar.dispose();
  s.avatars.dispose();
  s.library.dispose();
});

test("hand coverage composes with inspection without serialized state and clears on every ownership transition", async () => {
  const s = setup();
  await s.avatar.setAppearance(s.recipe);
  const relaxed = () => {
    const result = {} as Record<Hand, THREE.Mesh>;
    s.avatar.object.traverse((node) => {
      if (
        node instanceof THREE.Mesh &&
        node.userData.assetId === "body" &&
        node.userData.handSide
      )
        result[node.userData.handSide as Hand] = node;
    });
    return result;
  };
  const first = relaxed(),
    child = new THREE.Object3D();
  first.left.add(child);
  first.right.visible = false;
  const metadata = JSON.stringify(first.left.userData);
  let failLeft = false;
  const c = new WieldController(s.avatar, s.library, {
    tool: {
      create: (ctx) => ({
        update() {
          if (ctx.hand === "left" && failLeft) throw Error("retire left");
        },
      }),
    },
  });
  assert.equal(isWieldHandCovered(first.left), false);
  await c.setLoadout(s.loadout("wand", "wand"));
  assert.equal(isWieldHandCovered(first.left), true);
  assert.equal(isWieldHandCovered(first.right), true);
  assert.equal(isWieldHandCovered(child), true);
  assert.equal(isWieldHandCovered(s.avatar.object), false);
  assert.equal(
    isWieldHandCovered(mesh(c.getHand("left")!.grip)),
    false,
    "replacement grips do not hide themselves",
  );
  assert.equal(JSON.stringify(first.left.userData), metadata);
  // This is the same composition an application uses alongside garment coverage.
  for (const hand of ["left", "right"] as const)
    first[hand].visible = !isWieldHandCovered(first[hand]);
  assert.equal(first.left.visible, false);
  assert.equal(first.right.visible, false);
  c.setVisible(false);
  assert.equal(isWieldHandCovered(first.left), false);
  assert.equal(isWieldHandCovered(child), false);
  assert.equal(first.left.visible, true);
  assert.equal(first.right.visible, false);
  c.setVisible(true);
  assert.equal(isWieldHandCovered(first.left), true);
  await s.avatar.setAppearance(s.recipe);
  const next = relaxed();
  assert.equal(isWieldHandCovered(first.left), false);
  assert.equal(isWieldHandCovered(first.right), false);
  assert.equal(isWieldHandCovered(next.left), true);
  assert.equal(isWieldHandCovered(next.right), true);
  failLeft = true;
  s.avatar.update(0);
  assert.equal(c.getHand("left")!.state, "error");
  assert.equal(isWieldHandCovered(next.left), false);
  assert.equal(isWieldHandCovered(next.right), true);
  c.dispose();
  assert.equal(isWieldHandCovered(next.right), false);
  assert.equal(next.right.visible, true);
  const again = new WieldController(s.avatar, s.library, s.registry);
  await again.setLoadout(s.loadout(null, "wand"));
  assert.equal(isWieldHandCovered(next.right), true);
  s.avatar.dispose();
  assert.equal(isWieldHandCovered(next.right), false);
  s.avatars.dispose();
  s.library.dispose();
});
