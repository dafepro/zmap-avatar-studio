import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { AvatarLibrary, type Motion } from "../../src/runtime";
import { defaultRecipe, type Catalog } from "../../src/core";
import {
  WieldController,
  WieldLibrary,
  type WieldBehaviorRegistry,
  type WieldEvent,
} from "../../src/wield-runtime";
import {
  emptyWieldLoadout,
  type WieldCatalog,
  type Hand,
} from "../../src/wield-core";
import "./node-image";

const root = new URL("../../public/", import.meta.url);
const catalog: Catalog = JSON.parse(
  await readFile(new URL("catalog.json", root), "utf8"),
);
const oneHand: WieldCatalog = JSON.parse(
  await readFile(new URL("wield/catalog.json", root), "utf8"),
);
const twoHand: WieldCatalog = JSON.parse(
  await readFile(new URL("action/catalog.json", root), "utf8"),
);
export const performanceEquipment: WieldCatalog = {
  ...structuredClone(oneHand),
  id: "zoomap-performance-tests",
  items: [...structuredClone(oneHand.items), ...structuredClone(twoHand.items)],
};
const gearPaths = new Map([
  ...[...oneHand.items, ...Object.values(oneHand.grips)].map(
    (asset) => [asset.url, new URL(`wield/${asset.url}`, root)] as const,
  ),
  ...twoHand.items.map(
    (asset) => [asset.url, new URL(`action/${asset.url}`, root)] as const,
  ),
]);

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Real rig and item geometry with controllable asset completion; no mocked
 * joint poses or decorative stand-ins can hide ownership/retarget failures. */
export async function createPerformanceFixture(
  options: {
    delay?: (url: URL) => Promise<void>;
    fail?: (url: URL) => boolean;
    weight?: number;
  } = {},
) {
  const requested: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requested.push(url.pathname);
    await options.delay?.(url);
    if (options.fail?.(url))
      return new Response("unavailable", { status: 503 });
    const asset =
      url.hostname === "gear.test"
        ? gearPaths.get(url.pathname.slice(1))
        : new URL(url.pathname.slice(1), root);
    if (!asset) return new Response("missing approved model", { status: 404 });
    return new Response(await readFile(asset));
  };
  const library = new AvatarLibrary(catalog, "https://avatar.test/", fetcher);
  const gear = new WieldLibrary(
    performanceEquipment,
    "https://gear.test/",
    fetcher,
  );
  const avatar = library.create();
  const recipe = defaultRecipe(catalog);
  recipe.body = { weight: options.weight ?? 0 };
  await avatar.setAppearance(recipe);
  const events: WieldEvent[] = [],
    errors: unknown[] = [];
  const callbacks: { item: string; hand: Hand; type: string }[] = [];
  const registry: WieldBehaviorRegistry = Object.fromEntries(
    performanceEquipment.items.map((item) => [
      item.behavior,
      {
        create: (context: {
          itemId: string;
          hand: Hand;
          emit: (event: { type: string }) => void;
        }) => ({
          input: (event: { type: string }) => {
            callbacks.push({
              item: context.itemId,
              hand: context.hand,
              type: event.type,
            });
            if (event.type === "press") context.emit({ type: "activated" });
          },
          dispose: () => {
            callbacks.push({
              item: context.itemId,
              hand: context.hand,
              type: "disposed",
            });
          },
        }),
      },
    ]),
  );
  const controller = new WieldController(avatar, gear, registry, {
    onEvent: (event) => events.push(event),
    onError: (error) => errors.push(error),
  });
  let time = 0;
  avatar.update(time);
  const tick = (motion: Motion = {}, dt = 1 / 60) => {
    avatar.update((time += dt), motion);
  };
  const loadout = (
    left: string | null = null,
    right: string | null = null,
  ) => ({ ...emptyWieldLoadout(performanceEquipment), left, right });
  return {
    avatar,
    controller,
    library,
    gear,
    recipe,
    catalog,
    requested,
    events,
    errors,
    callbacks,
    tick,
    get time() {
      return time;
    },
    loadout,
    shared(item = "wield-rebound-panel", primary: Hand = "right") {
      return { ...loadout(), twoHanded: { item, primary } };
    },
    async until(
      predicate: () => boolean,
      message: string,
      motion: Motion = {},
      limit = 600,
    ) {
      for (let i = 0; i < limit; i++) {
        if (predicate()) return;
        tick(motion);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error(`Performance fixture timed out: ${message}`);
    },
    gripError() {
      avatar.object.updateMatrixWorld(true);
      let error = 0;
      for (const hand of ["left", "right"] as const) {
        const held = controller.getHand(hand);
        if (!held) continue;
        let presented = true;
        for (
          let parent: THREE.Object3D | null = held.object;
          parent;
          parent = parent.parent
        )
          if (!parent.visible) presented = false;
        if (!presented) continue;
        const frame = performanceEquipment.grips[hand].frame;
        const socket = avatar
          .attachmentView()!
          .sockets.get(hand === "left" ? "hand_L" : "hand_R")!;
        const expected = socket.matrixWorld
          .clone()
          .multiply(
            new THREE.Matrix4().compose(
              new THREE.Vector3(...frame.position),
              new THREE.Quaternion().setFromEuler(
                new THREE.Euler(...frame.rotation),
              ),
              new THREE.Vector3(1, 1, 1),
            ),
          );
        const actual = held.anchor("grip").matrixWorld;
        error = Math.max(
          error,
          ...actual.elements.map((value, index) =>
            Math.abs(value - expected.elements[index]),
          ),
        );
      }
      return error;
    },
    dispose() {
      controller.dispose();
      avatar.dispose();
      gear.dispose();
      library.dispose();
    },
  };
}
