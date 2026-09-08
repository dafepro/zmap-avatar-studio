import * as THREE from "three";
import { AvatarLibrary, type Motion } from "../../src/runtime";
import { ComicStyle } from "../../src/comic";
import { defaultRecipe, type Catalog } from "../../src/core";
import {
  WieldLibrary,
  WieldController,
  type WieldEvent,
} from "../../src/wield-runtime";
import {
  HANDS,
  emptyWieldLoadout,
  type WieldCatalog,
} from "../../src/wield-core";
import { playfulWieldBehaviors } from "../../src/wield-behaviors";

/** Include active instanced particles and drawn ribbons, not their unused pool. */
function vertices(root: THREE.Object3D) {
  const points: THREE.Vector3[] = [],
    instance = new THREE.Matrix4();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.comicOutline) return;
    if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
    const geometry = object.geometry,
      index = geometry.index,
      start = geometry.drawRange.start,
      end = Math.min(
        index?.count ?? geometry.attributes.position.count,
        start + geometry.drawRange.count,
      );
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let n = 0; n < instances; n++) {
      if (object instanceof THREE.InstancedMesh)
        object.getMatrixAt(n, instance);
      else instance.identity();
      instance.premultiply(object.matrixWorld);
      for (let i = start; i < end; i++)
        points.push(
          object
            .getVertexPosition(index?.getX(i) ?? i, new THREE.Vector3())
            .applyMatrix4(instance),
        );
    }
  });
  return points;
}

function count(root: THREE.Object3D) {
  let total = 0;
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.comicOutline) return;
    total +=
      ((object.geometry.index?.count ??
        object.geometry.attributes.position.count) /
        3) *
      (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return total;
}

function visualState(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const state: unknown[] = [];
  root.traverse((object) => {
    if (object.userData.comicOutline) return;
    state.push(object.name, object.visible, object.matrixWorld.toArray());
    if (object instanceof THREE.InstancedMesh)
      state.push(
        object.count,
        Array.from(object.instanceMatrix.array).slice(0, object.count * 16),
      );
    if (object instanceof THREE.Mesh) state.push(object.geometry.drawRange);
  });
  return JSON.stringify(state);
}

function sheet(width: number, height: number, title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#341e27";
  ctx.font = "bold 24px Arial";
  ctx.fillText(title, 20, 34);
  ctx.font = "15px Arial";
  ctx.fillText(
    "Actual browser geometry · shipping Blender exports, grip frames and behaviors",
    20,
    58,
  );
  return { canvas, ctx };
}

async function harness() {
  const [catalog, equipment]: [Catalog, WieldCatalog] = await Promise.all([
    fetch("/catalog.json").then((response) => response.json()),
    fetch("/wield/catalog.json").then((response) => response.json()),
  ]);
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href),
    wieldLibrary = new WieldLibrary(
      equipment,
      new URL("/wield/", location.href).href,
    ),
    avatar = library.create(),
    errors: string[] = [],
    events: WieldEvent[] = [],
    wield = new WieldController(avatar, wieldLibrary, playfulWieldBehaviors(), {
      onError: (error) => errors.push(String(error)),
      onEvent: (event) => events.push(event),
    }),
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    }),
    scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30),
    style = new ComicStyle({ inkWidth: 1.6 });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.setSize(360, 440);
  scene.add(avatar.object);
  const recipe = defaultRecipe(catalog);
  recipe.parts.hair = "hair-nova";
  Object.assign(recipe.colors, {
    skin: "#c08a64",
    hair: "#aa6031",
    primary: "#f4f1eb",
    secondary: "#292b2d",
  });
  await avatar.setAppearance(recipe);
  let time = 0;
  const tick = (motion: Motion = {}, dt = 1 / 30) => {
    time += dt;
    avatar.update(time, motion);
  };
  tick({ gesture: "idle", reducedMotion: true });
  const render = () => {
    style.update(
      scene,
      new THREE.Vector2(renderer.domElement.width, renderer.domElement.height),
    );
    renderer.render(scene, camera);
  };
  const frame = (
    points: THREE.Vector3[],
    width: number,
    height: number,
    yaw = 0,
    pitch = 0.1,
  ) => {
    const bounds = new THREE.Box3().setFromPoints(points),
      center = bounds.getCenter(new THREE.Vector3());
    renderer.setSize(width, height);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(Math.sin(yaw) * 5, pitch, Math.cos(yaw) * 5));
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    let horizontal = 0,
      vertical = 0;
    for (const point of points) {
      const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
      horizontal = Math.max(horizontal, Math.abs(view.x));
      vertical = Math.max(vertical, Math.abs(view.y));
    }
    const half =
      Math.max(vertical, horizontal / (width / height)) * 1.13 + 0.004;
    camera.top = half;
    camera.bottom = -half;
    camera.left = (-half * width) / height;
    camera.right = -camera.left;
    camera.updateProjectionMatrix();
  };
  const paint = (
    target: ReturnType<typeof sheet>,
    x: number,
    y: number,
    label: string,
  ) => {
    render();
    target.ctx.drawImage(renderer.domElement, x, y);
    target.ctx.fillStyle = "#341e27";
    target.ctx.font = "bold 15px Arial";
    target.ctx.fillText(label, x + 12, y + renderer.domElement.height - 8);
  };
  return {
    catalog,
    equipment,
    library,
    wieldLibrary,
    avatar,
    wield,
    errors,
    events,
    renderer,
    scene,
    camera,
    style,
    recipe,
    tick,
    frame,
    paint,
    render,
    dispose() {
      style.clear();
      wield.dispose();
      avatar.dispose();
      library.dispose();
      wieldLibrary.dispose();
      renderer.dispose();
    },
  };
}

export async function renderWieldStudy() {
  const h = await harness(),
    items = sheet(
      1140,
      80 + h.equipment.items.length * 360,
      "ZOOMAP · FIVE PLAYFUL TOOLS / FRONT · SIDE · BACK",
    ),
    grips = sheet(
      1800,
      80 + h.equipment.items.length * 320,
      "ZOOMAP · ONE GRIP / BOTH HANDS / THREE VIEWS",
    ),
    actions = sheet(1800, 80 + 3 * 600, "ZOOMAP · IN HAND, IN MOTION"),
    itemRecords = [],
    gripRecords = [],
    actionRecords = [];
  try {
    for (const [row, item] of h.equipment.items.entries()) {
      const object = await h.wieldLibrary.instantiate(item);
      h.scene.add(object);
      h.avatar.object.visible = false;
      for (const [column, yaw] of [0, Math.PI / 2, Math.PI].entries()) {
        h.frame(vertices(object), 380, 360, yaw);
        h.paint(
          items,
          column * 380,
          80 + row * 360,
          `${item.label} / ${["FRONT", "SIDE", "BACK"][column]}`,
        );
        itemRecords.push({
          id: item.id,
          view: column,
          triangles: count(object),
        });
      }
      // The fixture owns this approved clone, just like a consuming application.
      h.style.clear();
      h.scene.remove(object);
      const { disposeAvatarResources } = await import("../../src/runtime");
      disposeAvatarResources(object);
      h.avatar.object.visible = true;
      await h.wield.setLoadout({
        ...emptyWieldLoadout(h.equipment),
        left: item.id,
        right: item.id,
      });
      h.tick({ gesture: "idle", reducedMotion: true });
      for (const [sideIndex, hand] of HANDS.entries()) {
        const held = h.wield.getHand(hand)!;
        for (const [view, yaw] of [0, Math.PI / 2, Math.PI].entries()) {
          // Deliberately crop long items to show the real palm/handle contact.
          const wrist = h.avatar.object.getObjectByName(
            hand === "left" ? "hand_L" : "hand_R",
          )!;
          const ring = vertices(held.grip),
            center = new THREE.Box3()
              .setFromPoints(ring)
              .getCenter(new THREE.Vector3());
          const box = new THREE.Box3(
            center.clone().addScalar(-0.115),
            center.clone().addScalar(0.115),
          );
          h.frame([box.min, box.max, ...ring], 300, 320, yaw, 0.05);
          h.paint(
            grips,
            (sideIndex * 3 + view) * 300,
            80 + row * 320,
            `${item.label} / ${hand.toUpperCase()} ${["F", "S", "B"][view]}`,
          );
          gripRecords.push({
            id: item.id,
            hand,
            view,
            wrist: wrist.getWorldPosition(new THREE.Vector3()).toArray(),
            ...h.wield.diagnostics(),
          });
        }
      }
      for (const [view, gesture] of (
        ["idle", "walk", "wave"] as const
      ).entries()) {
        await h.wield.setLoadout({
          ...emptyWieldLoadout(h.equipment),
          left: item.id,
          right: item.id,
        });
        h.tick({ gesture });
        h.wield.press("left");
        h.wield.press("right");
        const before = visualState(h.avatar.object);
        for (let frame = 0; frame < 12; frame++) h.tick({ gesture });
        const extent = vertices(h.avatar.object);
        h.frame(extent, 360, 600, [0, Math.PI / 2, Math.PI / 5][view]);
        h.paint(
          actions,
          row * 360,
          80 + view * 600,
          `${item.label} / ${gesture.toUpperCase()}`,
        );
        actionRecords.push({
          id: item.id,
          gesture,
          changed: visualState(h.avatar.object) !== before,
          activeEffects: HANDS.reduce(
            (sum, hand) => sum + count(h.wield.getHand(hand)!.effects),
            0,
          ),
          ...h.wield.diagnostics(),
        });
        h.wield.release("left");
        h.wield.release("right");
        h.tick({ gesture, reducedMotion: true });
      }
    }
    return {
      items: items.canvas.toDataURL("image/png"),
      grips: grips.canvas.toDataURL("image/png"),
      actions: actions.canvas.toDataURL("image/png"),
      provenance: {
        kind: "actual-browser-geometry",
        appearanceRevision: h.catalog.revision,
        wieldRevision: h.equipment.revision,
        behavior: "playfulWieldBehaviors",
      },
      itemRecords,
      gripRecords,
      actionRecords,
      events: h.events,
      errors: h.errors,
    };
  } finally {
    h.dispose();
  }
}

export async function exerciseWieldRuntime() {
  const h = await harness(),
    combinations = [],
    reduced = [],
    lifecycle = [];
  try {
    const choices = [null, ...h.equipment.items.map((item) => item.id)];
    for (const left of choices)
      for (const right of choices) {
        await h.wield.setLoadout({
          ...emptyWieldLoadout(h.equipment),
          left,
          right,
        });
        h.wield.press("left");
        h.wield.press("right");
        for (let frame = 0; frame < 12; frame++) h.tick({ gesture: "idle" });
        const states = HANDS.filter((hand) => h.wield.getHand(hand)).map(
          (hand) => h.wield.getHand(hand)!.state,
        );
        combinations.push({
          left,
          right,
          states,
          actualVisible: count(h.avatar.object),
          ...h.wield.diagnostics(),
        });
        h.wield.cancel();
      }
    await h.wield.setLoadout({
      ...emptyWieldLoadout(h.equipment),
      left: "wield-bubble-comet",
      right: "wield-bubble-comet",
    });
    const left = h.wield.getHand("left")!,
      right = h.wield.getHand("right")!,
      independent =
        left.object !== right.object &&
        left.grip !== right.grip &&
        left.effects !== right.effects;
    const allocations = HANDS.map((hand) => {
      const objects: unknown[] = [];
      h.wield.getHand(hand)!.effects.traverse((object) => {
        if (object instanceof THREE.InstancedMesh)
          objects.push(
            object,
            object.geometry,
            object.material,
            object.instanceMatrix,
          );
      });
      return objects;
    });
    h.wield.press("left");
    h.wield.press("right");
    let maximumEffects = 0;
    const sustained = [];
    h.frame(vertices(h.avatar.object), 360, 440);
    for (let frame = 0; frame < 1800; frame++) {
      h.tick({ gesture: "idle" });
      maximumEffects = Math.max(
        maximumEffects,
        h.wield.diagnostics().effectTriangles,
      );
      if (frame % 15 === 0) h.render();
      if (frame % 300 === 299) sustained.push({ ...h.renderer.info.memory });
    }
    const allocationsStable = HANDS.every((hand, i) => {
      const now: unknown[] = [];
      h.wield.getHand(hand)!.effects.traverse((object) => {
        if (object instanceof THREE.InstancedMesh)
          now.push(
            object,
            object.geometry,
            object.material,
            object.instanceMatrix,
          );
      });
      return (
        now.length === allocations[i].length &&
        now.every((value, j) => value === allocations[i][j])
      );
    });
    const swapObjects = HANDS.map((hand) => h.wield.getHand(hand)!.object);
    let appearanceRetained = true;
    for (const weight of [-1, 1, 0]) {
      const recipe = structuredClone(h.recipe);
      recipe.body = { weight };
      recipe.parts.shirt = weight < 0 ? "shirt-hoodie" : "shirt-tide";
      recipe.colors.skin = weight < 0 ? "#855538" : "#edc39d";
      await h.avatar.setAppearance(recipe);
      h.tick({ gesture: "walk" });
      appearanceRetained &&= HANDS.every(
        (hand, i) => h.wield.getHand(hand)!.object === swapObjects[i],
      );
      h.render();
    }
    for (const item of h.equipment.items) {
      await h.wield.setLoadout({
        ...emptyWieldLoadout(h.equipment),
        left: item.id,
        right: item.id,
      });
      h.wield.press("left");
      h.wield.press("right");
      h.tick({ reducedMotion: true });
      const before = visualState(h.avatar.object);
      for (let frame = 0; frame < 60; frame++) h.tick({ reducedMotion: true });
      reduced.push({
        id: item.id,
        stable: before === visualState(h.avatar.object),
        ...h.wield.diagnostics(),
      });
    }
    await h.wield.setLoadout(emptyWieldLoadout(h.equipment));
    h.tick({ reducedMotion: true });
    h.render();
    const baseline = { ...h.renderer.info.memory };
    for (let cycle = 0; cycle < 6; cycle++) {
      await h.wield.setLoadout({
        ...emptyWieldLoadout(h.equipment),
        left: "wield-bubble-comet",
        right: "wield-bubble-comet",
      });
      h.wield.press("left");
      h.wield.press("right");
      for (let frame = 0; frame < 30; frame++) h.tick();
      h.render();
      await h.wield.setLoadout(emptyWieldLoadout(h.equipment));
      h.tick({ reducedMotion: true });
      h.render();
      lifecycle.push({ ...h.renderer.info.memory });
    }
    return {
      combinations,
      independent,
      allocationsStable,
      appearanceRetained,
      maximumEffects,
      sustained,
      reduced,
      baseline,
      lifecycle,
      events: h.events,
      errors: h.errors,
      simulatedSeconds: 60,
    };
  } finally {
    h.dispose();
  }
}
