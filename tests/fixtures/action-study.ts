import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  WieldLibrary,
  WieldController,
  emptyWieldLoadout,
  HANDS,
  disposeAvatarResources,
  type Catalog,
  type WieldCatalog,
  type Hand,
  type Motion,
} from "../../src/index";
import { fieldToolBehaviors } from "../../src/field-tools";

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
  ctx.fillStyle = "#30383c";
  ctx.font = "bold 24px Arial";
  ctx.fillText(title, 20, 34);
  ctx.font = "15px Arial";
  ctx.fillText(
    "Actual exported geometry · shared two-hand grips · restrained field equipment",
    20,
    58,
  );
  return { canvas, ctx };
}

async function harness() {
  const [catalog, equipment]: [Catalog, WieldCatalog] = await Promise.all([
    fetch("/catalog.json").then((response) => response.json()),
    fetch("/action/catalog.json").then((response) => response.json()),
  ]);
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const wieldLibrary = new WieldLibrary(
    equipment,
    new URL("/action/", location.href).href,
  );
  const avatar = library.create(),
    errors: string[] = [];
  const factories = { created: 0, disposed: 0, updates: 0 };
  const registry = fieldToolBehaviors();
  for (const entry of Object.values(registry)) {
    const create = entry.create;
    entry.create = (context) => {
      factories.created++;
      const behavior = create(context);
      return {
        ...behavior,
        update(frame) {
          factories.updates++;
          behavior.update?.(frame);
        },
        dispose() {
          factories.disposed++;
          behavior.dispose?.();
        },
      };
    };
  }
  const wield = new WieldController(avatar, wieldLibrary, registry, {
    onError: (error) => errors.push(String(error)),
  });
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30),
    style = new ComicStyle({ inkWidth: 1.5 });
  scene.add(avatar.object);
  const recipe = defaultRecipe(catalog);
  recipe.parts.hair = "hair-sweep";
  Object.assign(recipe.colors, {
    primary: "#e7e3d8",
    secondary: "#303b40",
    skin: "#c08a64",
    hair: "#4c392d",
  });
  await avatar.setAppearance(recipe);
  let time = 0;
  const tick = (motion: Motion = {}, dt = 1 / 30) => {
    time += dt;
    avatar.update(time, motion);
    avatar.object.updateWorldMatrix(true, true);
  };
  tick({ reducedMotion: true });
  const render = () => {
    style.update(scene, renderer.getDrawingBufferSize(new THREE.Vector2()));
    renderer.render(scene, camera);
  };
  function frame(
    points: THREE.Vector3[],
    width: number,
    height: number,
    view: string,
  ) {
    const box = new THREE.Box3().setFromPoints(points),
      center = box.getCenter(new THREE.Vector3());
    const deltas: Record<string, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0.12, 5),
      side: new THREE.Vector3(5, 0.12, 0),
      back: new THREE.Vector3(0, 0.12, -5),
      top: new THREE.Vector3(0, 5, 0.0001),
      angle: new THREE.Vector3(3, 0.16, 5),
    };
    renderer.setSize(width, height);
    camera.position.copy(center).add(deltas[view]);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    let x = 0,
      y = 0;
    for (const point of points) {
      const projected = point.clone().applyMatrix4(camera.matrixWorldInverse);
      x = Math.max(x, Math.abs(projected.x));
      y = Math.max(y, Math.abs(projected.y));
    }
    const half = Math.max(y, x / (width / height)) * 1.12 + 0.003;
    camera.top = half;
    camera.bottom = -half;
    camera.left = (-half * width) / height;
    camera.right = -camera.left;
    camera.updateProjectionMatrix();
  }
  const paint = (
    target: ReturnType<typeof sheet>,
    x: number,
    y: number,
    label: string,
  ) => {
    render();
    target.ctx.drawImage(renderer.domElement, x, y);
    target.ctx.fillStyle = "#f5f2ea";
    target.ctx.fillRect(
      x,
      y + renderer.domElement.height - 29,
      renderer.domElement.width,
      29,
    );
    target.ctx.fillStyle = "#30383c";
    target.ctx.font = "bold 13px Arial";
    target.ctx.fillText(label, x + 12, y + renderer.domElement.height - 10);
  };
  function gripFit() {
    let positionError = 0,
      basisError = 0;
    const actualFrames: Record<string, number[]> = {};
    for (const hand of HANDS) {
      const held = wield.getHand(hand)!,
        wrist = avatar.object.getObjectByName(
          hand === "left" ? "hand_L" : "hand_R",
        )!;
      const source = equipment.grips[hand].frame;
      const expected = wrist.matrixWorld
        .clone()
        .multiply(
          new THREE.Matrix4().compose(
            new THREE.Vector3(...source.position),
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(...source.rotation),
            ),
            new THREE.Vector3(1, 1, 1),
          ),
        );
      const actual = held.anchor("grip").matrixWorld;
      positionError = Math.max(
        positionError,
        new THREE.Vector3()
          .setFromMatrixPosition(expected)
          .distanceTo(new THREE.Vector3().setFromMatrixPosition(actual)),
      );
      for (let i = 0; i < 12; i++)
        basisError = Math.max(
          basisError,
          Math.abs(expected.elements[i] - actual.elements[i]),
        );
      actualFrames[hand] = actual.toArray();
    }
    let proper = true;
    avatar.object.traverse((node) => {
      if (node.matrixWorld.determinant() <= 0) proper = false;
    });
    const left = wield.getHand("left")!,
      right = wield.getHand("right")!;
    const relaxed: boolean[] = [];
    avatar.object.traverse((node) => {
      if (
        node instanceof THREE.Mesh &&
        !node.userData.comicOutline &&
        node.userData.avatarRegion?.startsWith("hand-")
      )
        relaxed.push(node.visible);
    });
    return {
      positionError,
      basisError,
      proper,
      actualFrames,
      oneObject: left.object === right.object,
      distinctGrips: left.grip !== right.grip,
      oneEffectGroup: left.effects === right.effects,
      relaxedHidden: relaxed.length === 2 && relaxed.every((value) => !value),
      actualVisible: count(avatar.object),
      ...wield.diagnostics(),
    };
  }
  return {
    catalog,
    equipment,
    library,
    wieldLibrary,
    avatar,
    wield,
    renderer,
    scene,
    camera,
    style,
    recipe,
    tick,
    render,
    frame,
    paint,
    gripFit,
    errors,
    factories,
    async equip(id: string, primary: Hand) {
      await wield.setLoadout({
        ...emptyWieldLoadout(equipment),
        twoHanded: { item: id, primary },
      });
    },
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

export async function renderActionStudy() {
  const h = await harness(),
    hero = sheet(
      1260,
      760,
      "ZOOMAP · THREE FIELD TOOLS / ONE SHARED GRIP SYSTEM",
    ),
    items = sheet(
      1600,
      80 + 3 * 390,
      "ZOOMAP · FIELD TOOLS / FRONT · SIDE · BACK · TOP",
    ),
    assembled = sheet(
      1800,
      80 + 3 * 570,
      "ZOOMAP · ONE DEVICE / TWO PHYSICAL HANDS",
    ),
    grips = sheet(
      1440,
      80 + 3 * 370,
      "ZOOMAP · MEASURED LEFT AND RIGHT HANDLE CONTACT",
    ),
    itemRecords = [],
    poseRecords = [],
    gripRecords = [];
  try {
    for (const [row, item] of h.equipment.items.entries()) {
      h.avatar.object.visible = false;
      const model = await h.wieldLibrary.instantiate(item);
      h.scene.add(model);
      for (const [column, view] of ["front", "side", "back", "top"].entries()) {
        h.frame(vertices(model), 400, 390, view);
        h.paint(
          items,
          column * 400,
          80 + row * 390,
          `${item.label} / ${view.toUpperCase()}`,
        );
        itemRecords.push({ id: item.id, view, triangles: count(model) });
      }
      h.style.clear();
      h.scene.remove(model);
      disposeAvatarResources(model);
      h.avatar.object.visible = true;
      for (const [primaryIndex, primary] of HANDS.entries()) {
        await h.equip(item.id, primary);
        for (const weight of [-1, 0, 1]) {
          await h.avatar.setAppearance({ ...h.recipe, body: { weight } });
          for (const gesture of ["idle", "walk", "run", "wave"] as const) {
            h.tick({ gesture });
            h.wield.press(primary);
            for (let frame = 0; frame < 9; frame++) h.tick({ gesture });
            const fit = h.gripFit();
            poseRecords.push({ id: item.id, primary, weight, gesture, ...fit });
            if (gesture === "idle") {
              h.frame(
                vertices(h.avatar.object),
                300,
                570,
                primaryIndex ? "angle" : "front",
              );
              h.paint(
                assembled,
                (primaryIndex * 3 + weight + 1) * 300,
                80 + row * 570,
                `${item.label} / ${primary} / ${weight > 0 ? "+" : ""}${weight}`,
              );
            }
            h.wield.release(primary);
            h.tick({ gesture, reducedMotion: true });
          }
        }
      }
      await h.avatar.setAppearance(h.recipe);
      await h.equip(item.id, "right");
      h.tick({ reducedMotion: true });
      h.frame(vertices(h.avatar.object), 420, 680, "angle");
      h.paint(hero, row * 420, 80, item.label);
      for (const [index, hand] of HANDS.entries()) {
        const held = h.wield.getHand(hand)!,
          center = new THREE.Box3()
            .setFromPoints(vertices(held.grip))
            .getCenter(new THREE.Vector3());
        const bounds = new THREE.Box3(
          center.clone().addScalar(-0.135),
          center.clone().addScalar(0.135),
        );
        for (const [viewIndex, view] of ["front", "side"].entries()) {
          h.frame(
            [bounds.min, bounds.max, ...vertices(held.grip)],
            360,
            370,
            view,
          );
          h.paint(
            grips,
            (index * 2 + viewIndex) * 360,
            80 + row * 370,
            `${item.label} / ${hand.toUpperCase()} / ${view}`,
          );
          gripRecords.push({ id: item.id, hand, view, ...h.gripFit() });
        }
      }
    }
    return {
      hero: hero.canvas.toDataURL("image/png"),
      items: items.canvas.toDataURL("image/png"),
      assembled: assembled.canvas.toDataURL("image/png"),
      grips: grips.canvas.toDataURL("image/png"),
      itemRecords,
      poseRecords,
      gripRecords,
      errors: h.errors,
      provenance: {
        kind: "actual-browser-geometry",
        catalog: h.equipment.id,
        revision: h.equipment.revision,
        appearanceRevision: h.catalog.revision,
        behavior: "fieldToolBehaviors",
        concepts: "docs/references/action/",
      },
    };
  } finally {
    h.dispose();
  }
}

export async function exerciseActionLifecycle() {
  const h = await harness(),
    ownership = [],
    mechanisms = [],
    lifecycle = [],
    appearance = [];
  const empty = emptyWieldLoadout(h.equipment);
  const mechanismNames: Record<string, string> = {
    "tether-winch": "spool",
    "rebound-panel": "impact",
    "wake-driver": "piston",
  };
  try {
    h.frame(vertices(h.avatar.object), 360, 480, "front");
    h.render();
    const baseline = { ...h.renderer.info.memory };
    for (let cycle = 0; cycle < 2; cycle++)
      for (const item of h.equipment.items)
        for (const primary of HANDS) {
          const createdBefore = h.factories.created,
            disposedBefore = h.factories.disposed;
          await h.equip(item.id, primary);
          h.tick({ reducedMotion: true });
          h.render();
          const held = h.wield.getHand(primary)!,
            other = primary === "left" ? "right" : "left";
          const mechanism = held.anchor(mechanismNames[item.behavior]),
            rest = mechanism.matrix.toArray();
          h.wield.press(other);
          for (let i = 0; i < 6; i++) h.tick();
          const indicator = held.effects.getObjectByName("field-panel-ready");
          const supportPassive = indicator
            ? !indicator.visible
            : JSON.stringify(rest) ===
              JSON.stringify(mechanism.matrix.toArray());
          h.wield.release(other);
          h.wield.press(primary);
          const updatesBefore = h.factories.updates;
          for (let i = 0; i < 9; i++) h.tick();
          const active = indicator
            ? indicator.visible
            : JSON.stringify(rest) !==
              JSON.stringify(mechanism.matrix.toArray());
          const oncePerFrame = h.factories.updates - updatesBefore === 9;
          h.tick({ reducedMotion: true });
          const reduced = visualState(held.object) + visualState(held.effects);
          for (let i = 0; i < 15; i++) h.tick({ reducedMotion: true });
          const reducedStable =
            reduced === visualState(held.object) + visualState(held.effects);
          mechanisms.push({
            id: item.id,
            primary,
            cycle,
            supportPassive,
            active,
            oncePerFrame,
            reducedStable,
          });
          if (cycle === 0) {
            for (const weight of [-1, 1]) {
              await h.avatar.setAppearance({
                ...h.recipe,
                body: { weight },
                parts: {
                  ...h.recipe.parts,
                  hair: "hair-halo",
                  shirt: "shirt-tide",
                },
              });
              h.tick({ reducedMotion: true });
              appearance.push({
                id: item.id,
                primary,
                weight,
                retained:
                  held.object === h.wield.getHand("left")?.object &&
                  held.object === h.wield.getHand("right")?.object,
                ...h.gripFit(),
              });
            }
            await h.avatar.setAppearance(h.recipe);
            h.tick({ reducedMotion: true });
          }
          h.style.clear();
          const resources = new Set<THREE.BufferGeometry | THREE.Material>();
          for (const root of [
            held.object,
            held.effects,
            h.wield.getHand("left")!.grip,
            h.wield.getHand("right")!.grip,
          ])
            root.traverse((node) => {
              if (!(node instanceof THREE.Mesh)) return;
              resources.add(node.geometry);
              for (const material of Array.isArray(node.material)
                ? node.material
                : [node.material])
                resources.add(material);
            });
          const disposed = new Map(
            [...resources].map((resource) => [resource, 0]),
          );
          for (const resource of resources)
            resource.addEventListener("dispose", () =>
              disposed.set(resource, disposed.get(resource)! + 1),
            );
          await h.wield.setLoadout(empty);
          h.tick({ reducedMotion: true });
          h.render();
          const relaxed: boolean[] = [];
          h.avatar.object.traverse((node) => {
            if (
              node instanceof THREE.Mesh &&
              !node.userData.comicOutline &&
              node.userData.avatarRegion?.startsWith("hand-")
            )
              relaxed.push(node.visible);
          });
          ownership.push({
            id: item.id,
            primary,
            cycle,
            oneCreate: h.factories.created - createdBefore === 1,
            oneDispose: h.factories.disposed - disposedBefore === 1,
            resourcesDisposedOnce: [...disposed.values()].every(
              (value) => value === 1,
            ),
            handSlotsEmpty:
              !h.wield.getHand("left") && !h.wield.getHand("right"),
            relaxedRestored: relaxed.length === 2 && relaxed.every(Boolean),
          });
          lifecycle.push({ ...h.renderer.info.memory });
        }
    return {
      ownership,
      mechanisms,
      appearance,
      lifecycle,
      baseline,
      errors: h.errors,
    };
  } finally {
    h.dispose();
  }
}
