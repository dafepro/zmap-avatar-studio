import * as THREE from "three";
import { AvatarError } from "./core.js";
import {
  AvatarInstance,
  VerifiedAssetLibrary,
  disposeAvatarResources,
  type AvatarAttachmentView,
  type AvatarHandLayer,
  type AvatarPoseFrame,
} from "./runtime.js";
import {
  HANDS,
  WIELD_LIMITS,
  emptyWieldLoadout,
  validateEuler,
  validateWieldCatalog,
  validateWieldLoadout,
  wieldAssetDescriptor,
  type Hand,
  type HandPose,
  type WieldAsset,
  type WieldCatalog,
  type WieldItem,
  type WieldLoadout,
} from "./wield-core.js";

const coveredRelaxedHands = new WeakSet<THREE.Object3D>();
/** Compose application inspection visibility with the controller's hand substitution.
 * Coverage follows ancestors (including an ink hull beneath a relaxed hand), is
 * never serialized, and ends on detach, retirement, appearance swap or disposal.
 */
export function isWieldHandCovered(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent)
    if (coveredRelaxedHands.has(node)) return true;
  return false;
}

export type WieldInput = {
  type: "press" | "release" | "cancel";
  sequence: number;
};
export type WieldFrame = {
  time: number;
  dt: number;
  elapsed: number;
  pressed: boolean;
  reducedMotion: boolean;
  sequence: number;
};
export type WieldIntent = { type: string; anchor?: string; value?: number };
/** A visual intent only: the host decides whether any world action is allowed. */
export type WieldEvent = WieldIntent & {
  hand: Hand;
  itemId: string;
  /** Correlates with input; multiple published events may share this value. */
  sequence: number;
  /** Unique within this controller lifetime; the app supplies session identity. */
  eventId: number;
  time: number;
  position?: [number, number, number];
  direction?: [number, number, number];
};
export type WieldBehavior = {
  input?(event: WieldInput): void;
  /** Bounded additive local Euler offsets, after the item's authored hold pose. */
  pose?(frame: WieldFrame): Partial<HandPose> | void;
  update?(frame: WieldFrame): void;
  /** Release listeners. Any manually disposed scene objects must also be removed;
   * the controller disposes all resources that remain in its owned groups. */
  dispose?(): void;
};
export type WieldBehaviorContext = {
  hand: Hand;
  itemId: string;
  object: THREE.Group;
  effects: THREE.Group;
  anchor(name: string): THREE.Object3D;
  emit(intent: WieldIntent): void;
};
export type WieldBehaviorRegistry = Record<
  string,
  {
    requiredAnchors?: readonly string[];
    create(context: WieldBehaviorContext): WieldBehavior;
  }
>;
export type WieldHandInstance = {
  readonly object: THREE.Group;
  readonly grip: THREE.Group;
  /** Wrist-local owned effect group; use worldToLocal for item anchor positions. */
  readonly effects: THREE.Group;
  readonly item: WieldItem;
  readonly state: "ready" | "error";
  readonly error?: unknown;
  anchor(name: string): THREE.Object3D;
};
type Held = WieldHandInstance & {
  hand: Hand;
  port: THREE.Group;
  behavior?: WieldBehavior;
  state: "ready" | "error";
  error?: unknown;
  committed: boolean;
  closed: boolean;
  pressed: boolean;
  sequence: number;
  elapsed: number;
  pending: { intent: WieldIntent; sequence: number }[];
  gripTransforms: {
    node: THREE.Object3D;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  }[];
};
function fail(message: string): never {
  throw new AvatarError("wield", message);
}
function uniqueNode(root: THREE.Object3D, name: string): THREE.Object3D {
  const nodes: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.name === name) nodes.push(node);
  });
  if (nodes.length !== 1)
    fail(`Equipment anchor/root ${name} must exist exactly once`);
  return nodes[0];
}
function sourceTriangles(mesh: THREE.Mesh) {
  return (
    (mesh.geometry.index?.count ??
      mesh.geometry.attributes.position?.count ??
      0) / 3
  );
}
function isWield(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent)
    if (node.userData.wieldOwned) return true;
  return false;
}
function count(root: THREE.Object3D, visible = false): number {
  let total = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node.userData.comicOutline) return;
    if (visible)
      for (
        let parent: THREE.Object3D | null = node;
        parent;
        parent = parent.parent
      )
        if (!parent.visible) return;
    total +=
      sourceTriangles(node) *
      (node instanceof THREE.InstancedMesh ? node.count : 1);
  });
  return total;
}
function skinColor(root: THREE.Object3D, color?: string) {
  if (!color) return;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (typeof node.userData.beforeAvatarDispose === "function")
      node.userData.beforeAvatarDispose();
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      if (material.name === "skin" && "color" in material)
        (material.color as THREE.Color).set(color);
  });
}
/** Shares streamed size limits, GLB policy, SHA verification and image ownership with avatars. */
export class WieldLibrary extends VerifiedAssetLibrary {
  readonly catalog: WieldCatalog;
  constructor(catalog: unknown, baseUrl: string, fetcher?: typeof fetch) {
    super(baseUrl, fetcher);
    validateWieldCatalog(catalog);
    this.catalog = structuredClone(catalog);
  }
  async instantiate(asset: WieldAsset): Promise<THREE.Group> {
    // Callers may only instantiate the exact approved descriptor, never arbitrary URLs.
    const approved = [
      ...Object.values(this.catalog.grips),
      ...this.catalog.items,
    ].find((a) => a.id === asset.id);
    if (!approved || JSON.stringify(approved) !== JSON.stringify(asset))
      fail("Unapproved equipment asset");
    const object = await this.instantiateAsset(
      wieldAssetDescriptor(approved, this.catalog.rig),
    );
    try {
      const root = uniqueNode(object, approved.node);
      const descendants = new Set<THREE.Object3D>();
      root.traverse((node) => descendants.add(node));
      object.traverse((node) => {
        if (node instanceof THREE.Mesh && !descendants.has(node))
          fail("Equipment geometry lies outside its approved root");
        if (node instanceof THREE.Mesh && "hand" in approved) {
          let side: unknown;
          for (
            let parent: THREE.Object3D | null = node;
            parent;
            parent = parent.parent
          )
            if (Object.hasOwn(parent.userData, "handSide")) {
              side = parent.userData.handSide;
              break;
            }
          if (side !== approved.hand)
            fail("Grip geometry lacks its approved semantic hand side");
        }
      });
      object.updateMatrixWorld(true);
      if (count(object) !== approved.triangles)
        fail("Loaded equipment triangle count differs from its manifest");
      return object;
    } catch (error) {
      disposeAvatarResources(object);
      throw error;
    }
  }
}

/** Two independent hands with atomic pair replacement and one avatar-owned pose lease. */
export class WieldController implements AvatarHandLayer {
  private hands: Partial<Record<Hand, Held>> = {};
  private current: WieldLoadout;
  private generation = 0;
  private closed = false;
  private paused = false;
  private visible = true;
  private pendingLoad = false;
  private releaseLease: () => void = () => {};
  private view?: AvatarAttachmentView;
  private hiddenHands = new Map<THREE.Mesh, boolean>();
  private handMeshes = new WeakMap<
    THREE.Object3D,
    Partial<Record<Hand, THREE.Mesh[]>>
  >();
  private visibleAppearance = 0;
  private frame: AvatarPoseFrame = {
    time: 0,
    dt: 0,
    interrupted: false,
    reducedMotion: false,
  };
  private events = 0;
  private inputSequences: Record<Hand, number> = { left: 0, right: 0 };
  private lastEventId = 0;
  private registry: WieldBehaviorRegistry;
  constructor(
    readonly avatar: AvatarInstance,
    readonly library: WieldLibrary,
    registry: WieldBehaviorRegistry,
    private options: {
      onEvent?: (event: WieldEvent) => void;
      onError?: (error: unknown, hand?: Hand) => void;
    } = {},
  ) {
    if (avatar.rig !== library.catalog.rig)
      fail("Avatar and equipment rigs differ");
    this.registry = Object.create(null);
    for (const item of library.catalog.items) {
      if (
        !Object.hasOwn(registry, item.behavior) ||
        typeof registry[item.behavior]?.create !== "function"
      )
        fail(`Unregistered equipment behavior ${item.behavior}`);
      const definition = registry[item.behavior];
      if (
        definition.requiredAnchors?.some(
          (name) => name !== "grip" && !Object.hasOwn(item.anchors, name),
        )
      )
        fail(`Missing declared behavior anchor on ${item.id}`);
      this.registry[item.behavior] = {
        ...definition,
        requiredAnchors: definition.requiredAnchors?.slice(),
      };
    }
    this.current = emptyWieldLoadout(library.catalog);
    this.releaseLease = avatar.claimHandLayer(this);
  }
  get loadout(): WieldLoadout {
    return structuredClone(this.current);
  }
  get state(): "ready" | "loading" | "disposed" {
    return this.closed ? "disposed" : this.pendingLoad ? "loading" : "ready";
  }
  getHand(hand: Hand): WieldHandInstance | undefined {
    this.checkHand(hand);
    return this.hands[hand];
  }
  private checkHand(hand: Hand) {
    if (!HANDS.includes(hand)) fail("Unknown hand slot");
  }
  private assertOpen() {
    if (this.closed)
      throw new AvatarError("disposed", "Hand controller is disposed");
  }
  private report(error: unknown, hand?: Hand) {
    // User callbacks cannot interrupt scene ownership cleanup.
    try {
      this.options.onError?.(error, hand);
    } catch {
      /* host callback failed */
    }
  }
  private async stage(
    hand: Hand,
    itemId: string | null,
  ): Promise<Held | undefined> {
    if (itemId === null) return undefined;
    const item = this.library.catalog.items.find(
      (asset) => asset.id === itemId,
    )!;
    const results = await Promise.allSettled([
      this.library.instantiate(item),
      this.library.instantiate(this.library.catalog.grips[hand]),
    ]);
    const failure = results.find((r) => r.status === "rejected");
    if (failure) {
      for (const result of results)
        if (result.status === "fulfilled") disposeAvatarResources(result.value);
      throw (failure as PromiseRejectedResult).reason;
    }
    const object = (results[0] as PromiseFulfilledResult<THREE.Group>).value;
    const grip = (results[1] as PromiseFulfilledResult<THREE.Group>).value;
    const port = new THREE.Group(),
      effects = new THREE.Group();
    port.name = `wield-port-${hand}`;
    port.userData.wieldOwned = true;
    object.name = `wield-${hand}-${item.id}`;
    effects.name = `wield-effects-${hand}`;
    effects.userData.wieldEffect = true;
    effects.userData.comicSkip = true;
    port.add(grip, object, effects);
    const instance: Held = {
      hand,
      object,
      grip,
      effects,
      port,
      item: structuredClone(item),
      committed: false,
      closed: false,
      pressed: false,
      sequence: this.inputSequences[hand],
      elapsed: 0,
      state: "ready",
      pending: [],
      gripTransforms: [],
      anchor: () => fail("Equipment anchors not initialized"),
    };
    try {
      const approvedRoot = uniqueNode(object, item.node),
        nodes = new Map<string, THREE.Object3D>();
      for (const [logical, actual] of Object.entries({
        grip: item.gripAnchor,
        ...item.anchors,
      }))
        nodes.set(logical, uniqueNode(approvedRoot, actual));
      instance.anchor = (name) =>
        nodes.get(name) ?? fail(`Unknown logical equipment anchor ${name}`);
      object.updateMatrixWorld(true);
      const anchor = instance.anchor("grip");
      const authored = new THREE.Matrix4()
        .copy(object.matrixWorld)
        .invert()
        .multiply(anchor.matrixWorld);
      const position = new THREE.Vector3(),
        rotation = new THREE.Quaternion(),
        scale = new THREE.Vector3();
      authored.decompose(position, rotation, scale);
      if (
        !authored.elements.every(Number.isFinite) ||
        Math.abs(authored.determinant() - 1) > 1e-5 ||
        scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-5 ||
        position.length() > 2
      )
        fail(
          "Grip anchor must use a finite rigid frame without reflection or scale",
        );
      const frame = this.library.catalog.grips[hand].frame;
      const target = new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(frame.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...frame.rotation)),
        new THREE.Vector3(1, 1, 1),
      );
      target
        .multiply(authored.invert())
        .decompose(object.position, object.quaternion, object.scale);
      for (
        let node: THREE.Object3D | null = anchor;
        node && node !== port;
        node = node.parent
      )
        instance.gripTransforms.push({
          node,
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
          scale: node.scale.clone(),
        });
      const behavior = this.registry[item.behavior].create({
        hand,
        itemId: item.id,
        object,
        effects,
        anchor: instance.anchor,
        emit: (intent) => this.enqueue(instance, intent),
      });
      if (
        !behavior ||
        typeof behavior !== "object" ||
        ["input", "pose", "update", "dispose"].some(
          (key) =>
            (behavior as any)[key] !== undefined &&
            typeof (behavior as any)[key] !== "function",
        )
      )
        fail("Invalid registered equipment behavior");
      instance.behavior = behavior;
      this.validateGripTransforms(instance);
      this.effectBudget({ [hand]: instance });
      return instance;
    } catch (error) {
      this.destroy(instance);
      throw error;
    }
  }
  /** Stage only changed hands; unchanged ready owners keep input and behavior state. */
  async setLoadout(loadout: WieldLoadout): Promise<boolean> {
    this.assertOpen();
    validateWieldLoadout(loadout, this.library.catalog);
    const approved = structuredClone(loadout),
      generation = ++this.generation;
    const retained: Partial<Record<Hand, Held>> = {};
    for (const hand of HANDS) {
      const current = this.hands[hand];
      if (
        current &&
        !current.closed &&
        current.state === "ready" &&
        current.item.id === approved[hand]
      )
        retained[hand] = current;
    }
    if (
      HANDS.every((hand) =>
        approved[hand] === null ? !this.hands[hand] : !!retained[hand],
      )
    ) {
      // Reasserting the current pair also invalidates an older pending request.
      this.pendingLoad = false;
      return true;
    }
    this.pendingLoad = true;
    let owned: Partial<Record<Hand, Held>> = {};
    const candidate: Partial<Record<Hand, Held>> = {};
    try {
      const results = await Promise.allSettled(
        HANDS.map((hand) =>
          retained[hand]
            ? Promise.resolve(retained[hand])
            : this.stage(hand, approved[hand]),
        ),
      );
      for (let i = 0; i < HANDS.length; i++)
        if (results[i].status === "fulfilled") {
          const hand = HANDS[i],
            instance = (results[i] as PromiseFulfilledResult<Held | undefined>)
              .value;
          candidate[hand] = instance;
          if (instance && instance !== retained[hand]) owned[hand] = instance;
        }
      const failure = results.find((r) => r.status === "rejected");
      if (failure) throw (failure as PromiseRejectedResult).reason;
      if (this.closed || generation !== this.generation) {
        this.destroyHands(owned);
        return false;
      }
      for (const hand of HANDS)
        if (
          retained[hand] &&
          (this.hands[hand] !== retained[hand] ||
            retained[hand]!.closed ||
            retained[hand]!.state !== "ready")
        )
          fail(
            "An unchanged hand failed while equipment was loading; retry the loadout",
          );
      const view = this.avatar.attachmentView();
      if (
        !view &&
        HANDS.some((hand) => candidate[hand] && !candidate[hand]!.closed)
      )
        fail("Equip items after the avatar appearance is ready");
      if (view) this.validateCandidate(view, candidate);
      const retired: Partial<Record<Hand, Held>> = {};
      for (const hand of HANDS)
        if (this.hands[hand] !== candidate[hand])
          retired[hand] = this.hands[hand];
      this.detach();
      this.hands = candidate;
      this.current = approved;
      this.destroyHands(retired);
      for (const hand of HANDS)
        if (owned[hand]) {
          owned[hand]!.committed = true;
          owned[hand]!.sequence = this.inputSequences[hand];
        }
      owned = {};
      if (view) {
        this.attach(view);
        this.pose({ ...this.frame, dt: 0 }, view);
        this.avatar.object.updateMatrixWorld(true);
      }
      return true;
    } catch (error) {
      // Borrowed ready entries belong to the existing loadout, never this request.
      this.destroyHands(owned);
      if (generation === this.generation && !this.closed) this.report(error);
      throw error;
    } finally {
      if (generation === this.generation) this.pendingLoad = false;
    }
  }
  private relaxedHands(view: AvatarAttachmentView, hand: Hand): THREE.Mesh[] {
    const cached = this.handMeshes.get(view.root)?.[hand];
    if (cached) return cached;
    const socket = view.sockets.get(hand === "left" ? "hand_L" : "hand_R");
    if (!socket) fail(`Rig has no ${hand} hand port`);
    const meshes: THREE.Mesh[] = [];
    view.root.traverse((node) => {
      if (
        !(node instanceof THREE.Mesh) ||
        node.userData.comicOutline ||
        isWield(node)
      )
        return;
      let side: unknown;
      for (
        let parent: THREE.Object3D | null = node;
        parent && parent !== view.root;
        parent = parent.parent
      )
        if (Object.hasOwn(parent.userData, "handSide")) {
          side = parent.userData.handSide;
          break;
        }
      if (side !== hand) return;
      if (node instanceof THREE.SkinnedMesh) {
        const joints = node.geometry.getAttribute("skinIndex"),
          weights = node.geometry.getAttribute("skinWeight");
        if (!joints || !weights) fail("Tagged relaxed hand has no rig weights");
        for (let i = 0; i < weights.count; i++)
          for (let j = 0; j < 4; j++)
            if (
              weights.getComponent(i, j) > 0 &&
              node.skeleton.bones[joints.getComponent(i, j)] !== socket
            )
              fail("Replaceable hand geometry must be bound only to its wrist");
      } else {
        let ancestor: THREE.Object3D | null = node;
        while (ancestor && ancestor !== socket) ancestor = ancestor.parent;
        if (!ancestor) fail("Tagged relaxed hand is not attached to its wrist");
      }
      meshes.push(node);
    });
    if (meshes.length === 0)
      fail(`Appearance has no semantic replaceable ${hand} hand meshes`);
    const cache = this.handMeshes.get(view.root) ?? {};
    cache[hand] = meshes;
    this.handMeshes.set(view.root, cache);
    return meshes;
  }
  private appearanceBudget(
    view: AvatarAttachmentView,
    hands: Partial<Record<Hand, Held>>,
    visible = this.visible,
  ) {
    const replaced = new Set<THREE.Mesh>();
    for (const hand of HANDS)
      if (visible && hands[hand] && !hands[hand]!.closed)
        for (const mesh of this.relaxedHands(view, hand)) replaced.add(mesh);
    let appearance = 0,
      visibleAppearance = 0,
      replacedTriangles = 0;
    view.root.traverse((node) => {
      if (
        !(node instanceof THREE.Mesh) ||
        node.userData.comicOutline ||
        isWield(node)
      )
        return;
      const triangles = sourceTriangles(node);
      appearance += triangles;
      let visible = true;
      for (
        let parent: THREE.Object3D | null = node;
        parent;
        parent = parent.parent
      )
        if (
          !(parent instanceof THREE.Mesh && this.hiddenHands.has(parent)
            ? this.hiddenHands.get(parent)
            : parent.visible)
        )
          visible = false;
      if (visible) {
        if (replaced.has(node)) replacedTriangles += triangles;
        else visibleAppearance += triangles;
      }
    });
    return { appearance, visibleAppearance, replacedTriangles };
  }
  private effectBudget(hands = this.hands): number {
    let effects = 0;
    for (const hand of HANDS) {
      const instance = hands[hand];
      if (!instance || instance.closed) continue;
      let nodes = 0;
      instance.effects.traverse((node) => {
        nodes++;
        node.userData.wieldEffect = true;
        node.userData.comicSkip = true;
        if (node instanceof THREE.Mesh) {
          if (node instanceof THREE.InstancedMesh) {
            if (
              !Number.isSafeInteger(node.count) ||
              node.count < 0 ||
              node.count > node.instanceMatrix.count
            )
              fail("Invalid bounded effect instance count");
            effects += sourceTriangles(node) * node.instanceMatrix.count;
          } else effects += sourceTriangles(node);
        } else if (
          node instanceof THREE.Points ||
          node instanceof THREE.Line ||
          node instanceof THREE.Sprite
        )
          fail("Equipment effects use budgeted triangle meshes only");
      });
      if (nodes > 256) fail("Equipment effect node budget exceeded");
    }
    if (!Number.isFinite(effects) || effects > WIELD_LIMITS.effects)
      fail("Equipment effect triangle budget exceeded");
    return effects;
  }
  private validateCandidate(
    view: AvatarAttachmentView,
    hands: Partial<Record<Hand, Held>>,
    visible = this.visible,
  ) {
    if (view.rig !== this.library.catalog.rig) fail("Equipment rig changed");
    const appearance = this.appearanceBudget(view, hands, visible);
    let held = 0,
      bytes = 0;
    for (const hand of HANDS)
      if (hands[hand] && !hands[hand]!.closed) {
        for (const part of ["arm", "forearm", "hand"])
          if (!view.sockets.has(`${part}_${hand === "left" ? "L" : "R"}`))
            fail("Incomplete wielding rig");
        held +=
          hands[hand]!.item.triangles +
          this.library.catalog.grips[hand].triangles;
        bytes +=
          hands[hand]!.item.bytes + this.library.catalog.grips[hand].bytes;
      }
    const effects = this.effectBudget(hands);
    if (
      held > WIELD_LIMITS.held ||
      bytes > WIELD_LIMITS.heldBytes ||
      appearance.visibleAppearance + (visible ? held + effects : 0) >
        WIELD_LIMITS.visible
    )
      fail("Combined visible equipment budget exceeded");
  }
  validate(view: AvatarAttachmentView) {
    this.validateCandidate(view, this.hands);
  }
  attach(view: AvatarAttachmentView) {
    this.view = view;
    this.visibleAppearance = this.appearanceBudget(
      view,
      this.hands,
    ).visibleAppearance;
    if (!this.visible) return;
    for (const hand of HANDS) {
      const instance = this.hands[hand];
      if (!instance || instance.closed) continue;
      for (const mesh of this.relaxedHands(view, hand)) {
        this.hiddenHands.set(mesh, mesh.visible);
        coveredRelaxedHands.add(mesh);
        mesh.visible = false;
      }
      skinColor(instance.grip, view.recipe.colors.skin);
      view.sockets
        .get(hand === "left" ? "hand_L" : "hand_R")!
        .add(instance.port);
    }
  }
  detach() {
    for (const [mesh, visible] of this.hiddenHands) {
      coveredRelaxedHands.delete(mesh);
      mesh.visible = visible;
    }
    this.hiddenHands.clear();
    for (const hand of HANDS) this.hands[hand]?.port.removeFromParent();
    this.view = undefined;
  }
  private enqueue(instance: Held, intent: WieldIntent) {
    if (
      instance.closed ||
      instance.state !== "ready" ||
      !instance.committed ||
      !this.visible
    )
      return;
    if (
      !intent ||
      typeof intent !== "object" ||
      Object.keys(intent).some(
        (k) => !["type", "anchor", "value"].includes(k),
      ) ||
      typeof intent.type !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(intent.type) ||
      (intent.value !== undefined &&
        (!Number.isFinite(intent.value) || Math.abs(intent.value) > 1e6))
    )
      fail("Invalid bounded wield intent");
    if (intent.anchor !== undefined) instance.anchor(intent.anchor);
    if (
      this.events >= WIELD_LIMITS.eventsPerFrame ||
      instance.pending.length >= WIELD_LIMITS.eventsPerFrame / 2
    )
      fail("Equipment event rate exceeded");
    this.events++;
    instance.pending.push({
      intent: { ...intent },
      sequence: instance.sequence,
    });
  }
  private nextInputSequence(hand: Hand) {
    if (this.inputSequences[hand] >= Number.MAX_SAFE_INTEGER)
      fail("Equipment input sequence exhausted");
    return ++this.inputSequences[hand];
  }
  private input(hand: Hand, type: WieldInput["type"]) {
    this.checkHand(hand);
    const instance = this.hands[hand];
    if (!instance || instance.state !== "ready" || this.closed) return;
    if (type === "press" && (this.paused || !this.visible || instance.pressed))
      return;
    if (type === "release" && !instance.pressed) return;
    instance.pressed = type === "press";
    try {
      instance.sequence = this.nextInputSequence(hand);
      instance.behavior?.input?.({ type, sequence: instance.sequence });
    } catch (error) {
      this.breakHand(instance, error);
    }
  }
  press(hand: Hand) {
    this.input(hand, "press");
  }
  release(hand: Hand) {
    this.input(hand, "release");
  }
  cancel(hand?: Hand) {
    for (const side of hand === undefined ? HANDS : [hand])
      this.input(side, "cancel");
  }
  setPaused(paused: boolean) {
    if (typeof paused !== "boolean") fail("Pause state must be boolean");
    if (paused && !this.paused) this.cancel();
    this.paused = paused;
  }
  /** Inspection visibility retains equipment state/resources independently of pause. */
  setVisible(visible: boolean) {
    this.assertOpen();
    if (typeof visible !== "boolean")
      fail("Equipment visibility must be boolean");
    if (visible === this.visible) return;
    const view = this.avatar.attachmentView();
    if (visible && view) this.validateCandidate(view, this.hands, true);
    this.visible = visible;
    if (!visible) {
      this.cancel();
      for (const hand of HANDS)
        if (this.hands[hand]) this.hands[hand]!.pending = [];
      this.events = 0;
    }
    this.detach();
    if (view) this.attach(view);
    this.avatar.refreshPose();
  }
  private behaviorFrame(instance: Held, frame: AvatarPoseFrame): WieldFrame {
    return {
      time: frame.time,
      dt: this.paused ? 0 : frame.dt,
      elapsed: instance.elapsed,
      pressed: instance.pressed,
      reducedMotion: frame.reducedMotion || this.paused,
      sequence: instance.sequence,
    };
  }
  pose(frame: AvatarPoseFrame, view: AvatarAttachmentView) {
    this.frame = frame;
    if (frame.interrupted) this.cancel();
    if (!this.visible) return;
    for (const hand of HANDS) {
      const instance = this.hands[hand];
      if (!instance || instance.closed) continue;
      const pose = instance.item.pose[hand];
      let delta: Partial<HandPose> | void;
      try {
        delta =
          instance.state === "ready"
            ? instance.behavior?.pose?.(this.behaviorFrame(instance, frame))
            : undefined;
        if (
          delta &&
          (typeof delta !== "object" ||
            Object.keys(delta).some(
              (key) => !["arm", "forearm", "wrist"].includes(key),
            ))
        )
          fail("Invalid equipment pose delta");
        for (const part of ["arm", "forearm", "wrist"] as const)
          if (delta?.[part]) validateEuler(delta[part], Math.PI / 2);
      } catch (error) {
        this.breakHand(instance, error);
        delta = undefined;
      }
      for (const part of ["arm", "forearm", "wrist"] as const) {
        const node = view.sockets.get(
          `${part === "wrist" ? "hand" : part}_${hand === "left" ? "L" : "R"}`,
        )!;
        const angles = pose[part].map(
          (angle, i) => angle + (delta?.[part]?.[i] ?? 0),
        );
        node.rotation.set(angles[0], angles[1], angles[2]);
      }
    }
  }
  update(frame: AvatarPoseFrame, view: AvatarAttachmentView) {
    if (!this.visible) return;
    for (const hand of HANDS) {
      const instance = this.hands[hand];
      if (!instance || instance.state !== "ready") continue;
      try {
        if (!this.paused) instance.elapsed += frame.dt;
        instance.behavior?.update?.(this.behaviorFrame(instance, frame));
        this.validateGripTransforms(instance);
        const effects = this.effectBudget();
        let held = 0;
        for (const side of HANDS)
          if (this.hands[side] && !this.hands[side]!.closed) {
            const entry = this.hands[side]!;
            const actual = count(entry.object) + count(entry.grip);
            const approved =
              entry.item.triangles + this.library.catalog.grips[side].triangles;
            if (actual > approved)
              fail("Behavior added geometry outside its effect allocation");
            held += actual;
          }
        if (
          held > WIELD_LIMITS.held ||
          this.visibleAppearance + held + effects > WIELD_LIMITS.visible
        )
          fail("Combined visible equipment budget exceeded");
        instance.port.updateWorldMatrix(true, true);
        for (const queued of instance.pending.splice(0)) {
          if (!instance.committed || !this.visible || instance.closed) continue;
          const { intent, sequence } = queued;
          if (this.lastEventId >= Number.MAX_SAFE_INTEGER)
            fail("Equipment event sequence exhausted");
          const event: WieldEvent = {
            ...intent,
            eventId: ++this.lastEventId,
            hand,
            itemId: instance.item.id,
            sequence,
            time: frame.time,
          };
          if (intent.anchor) {
            const anchor = instance.anchor(intent.anchor);
            event.position = anchor
              .getWorldPosition(new THREE.Vector3())
              .toArray();
            event.direction = new THREE.Vector3(0, 0, 1)
              .transformDirection(anchor.matrixWorld)
              .toArray();
          }
          this.options.onEvent?.(event);
        }
      } catch (error) {
        this.breakHand(instance, error);
      }
    }
    this.events = 0;
  }
  private validateGripTransforms(instance: Held) {
    for (const rest of instance.gripTransforms) {
      if (
        rest.node.position.distanceToSquared(rest.position) > 1e-12 ||
        1 - Math.abs(rest.node.quaternion.dot(rest.quaternion)) > 1e-12 ||
        Math.abs(rest.node.quaternion.lengthSq() - rest.quaternion.lengthSq()) >
          1e-12 ||
        rest.node.scale.distanceToSquared(rest.scale) > 1e-12 ||
        ![
          ...rest.node.position,
          ...rest.node.quaternion,
          ...rest.node.scale,
        ].every(Number.isFinite)
      )
        fail(
          "Behavior changed the owned item grip frame; use the hand pose layer",
        );
    }
  }
  private breakHand(instance: Held, error: unknown) {
    if (instance.state === "error") return;
    instance.state = "error";
    instance.error = error;
    instance.pressed = false;
    this.events = Math.max(0, this.events - instance.pending.length);
    instance.pending = [];
    for (const rest of instance.gripTransforms) {
      rest.node.position.copy(rest.position);
      rest.node.quaternion.copy(rest.quaternion);
      rest.node.scale.copy(rest.scale);
    }
    if (this.view)
      for (const mesh of this.relaxedHands(this.view, instance.hand)) {
        const previous = this.hiddenHands.get(mesh);
        if (previous !== undefined) mesh.visible = previous;
        this.hiddenHands.delete(mesh);
        coveredRelaxedHands.delete(mesh);
      }
    // A failed extension must not leave unbounded or misaligned geometry live.
    // Keep the explicit error handle while retiring its complete visual owner.
    this.destroy(instance);
    if (this.view)
      this.visibleAppearance = this.appearanceBudget(
        this.view,
        this.hands,
      ).visibleAppearance;
    this.report(error, instance.hand);
  }
  private destroy(instance: Held) {
    if (instance.closed) return;
    const wasCommitted = instance.committed;
    instance.closed = true;
    instance.committed = false;
    try {
      if (wasCommitted)
        instance.behavior?.input?.({
          type: "cancel",
          sequence: (instance.sequence = this.nextInputSequence(instance.hand)),
        });
    } catch (error) {
      this.report(error, instance.hand);
    }
    try {
      instance.behavior?.dispose?.();
    } catch (error) {
      this.report(error, instance.hand);
    }
    instance.behavior = undefined;
    this.events = Math.max(0, this.events - instance.pending.length);
    instance.pending = [];
    instance.port.removeFromParent();
    disposeAvatarResources(instance.port);
    instance.port.clear();
  }
  private destroyHands(hands: Partial<Record<Hand, Held>>) {
    for (const hand of HANDS)
      if (hands[hand] && !hands[hand]!.closed) this.destroy(hands[hand]!);
  }
  diagnostics() {
    const view = this.avatar.attachmentView();
    const appearance = view
      ? this.appearanceBudget(view, this.hands)
      : { appearance: 0, visibleAppearance: 0, replacedTriangles: 0 };
    let held = 0,
      heldBytes = 0,
      equippedHands = 0;
    for (const hand of HANDS)
      if (this.hands[hand] && !this.hands[hand]!.closed) {
        held +=
          this.hands[hand]!.item.triangles +
          this.library.catalog.grips[hand].triangles;
        heldBytes +=
          this.hands[hand]!.item.bytes + this.library.catalog.grips[hand].bytes;
        equippedHands++;
      }
    const effects = this.effectBudget();
    return {
      state: this.state,
      visible: this.visible,
      appearanceTriangles: appearance.appearance,
      heldTriangles: held,
      visibleTriangles:
        appearance.visibleAppearance + (this.visible ? held + effects : 0),
      effectTriangles: effects,
      replacedTriangles: appearance.replacedTriangles,
      heldBytes,
      equippedHands,
    };
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.pendingLoad = false;
    this.releaseLease();
    this.destroyHands(this.hands);
    this.hands = {};
    this.current = emptyWieldLoadout(this.library.catalog);
  }
}
