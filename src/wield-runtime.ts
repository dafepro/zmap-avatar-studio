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
export type WieldObjectPose = {
  position?: [number, number, number];
  rotation?: [number, number, number];
};
export type WieldBehavior = {
  input?(event: WieldInput): void;
  /** Bounded additive local Euler offsets, after the item's authored hold pose. */
  pose?(frame: WieldFrame): Partial<HandPose> | void;
  /** Two-handed mode moves one shared object; both arms solve against its frames. */
  objectPose?(frame: WieldFrame): WieldObjectPose | void;
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
  /** Owner-local effects (wrist or chest); use worldToLocal for world positions. */
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
  occupied: readonly Hand[];
  grips: Partial<Record<Hand, THREE.Group>>;
  gripPorts: Partial<Record<Hand, THREE.Group>>;
  views: Partial<Record<Hand, WieldHandInstance>>;
  physicalAnchors?: Record<Hand, THREE.Object3D>;
  objectMotion?: WieldObjectPose;
  gripTransforms: {
    node: THREE.Object3D;
    parent: THREE.Object3D | null;
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
export const WIELD_IK_LIMITS = Object.freeze({
  minElbowDegrees: 5,
  maxElbowDegrees: 150,
  maxWristDegrees: 75,
  objectTranslation: 0.08,
  objectRotation: Math.PI / 6,
});
export type WieldArmSolution = {
  arm: THREE.Quaternion;
  forearm: THREE.Quaternion;
  wrist: THREE.Quaternion;
  upperLength: number;
  lowerLength: number;
  reach: number;
  elbowDegrees: number;
  wristDegrees: number;
  elbow: THREE.Vector3;
};
function rigidFrame(matrix: THREE.Matrix4, label: string) {
  const position = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  if (
    !matrix.elements.every(Number.isFinite) ||
    Math.abs(matrix.determinant() - 1) > 1e-5 ||
    scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-5
  )
    fail(`${label} must be a finite rigid frame without reflection or scale`);
  return { position, quaternion };
}
/** Analytic, non-stretching two-bone IK in the common shoulder-parent frame.
 * Computes both joint rotations before any caller applies them. Body/world scale
 * cancels in that frame; elbow poles are shared rig policy, never item offsets.
 */
export function solveWieldArm(
  view: AvatarAttachmentView,
  hand: Hand,
  targetWorld: THREE.Matrix4,
): WieldArmSolution {
  const suffix = hand === "left" ? "L" : "R",
    side = hand === "left" ? -1 : 1;
  const arm = view.sockets.get(`arm_${suffix}`),
    forearm = view.sockets.get(`forearm_${suffix}`),
    wrist = view.sockets.get(`hand_${suffix}`),
    chest = view.sockets.get("chest");
  if (
    !arm ||
    !forearm ||
    !wrist ||
    !chest ||
    arm.parent !== chest ||
    forearm.parent !== arm ||
    wrist.parent !== forearm
  )
    fail("Two-handed IK requires the declared chest/arm/forearm/wrist chain");
  for (const bone of [arm, forearm, wrist])
    if (bone.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-8)
      fail("IK joint scales cannot stretch arm reach");
  chest.updateWorldMatrix(true, false);
  const target = rigidFrame(
    chest.matrixWorld.clone().invert().multiply(targetWorld),
    "IK wrist target",
  );
  const upper = forearm.position.clone(),
    lower = wrist.position.clone(),
    upperLength = upper.length(),
    lowerLength = lower.length();
  const direction = target.position.clone().sub(arm.position),
    reach = direction.length();
  if (
    upperLength < 0.01 ||
    lowerLength < 0.01 ||
    reach <= Math.abs(upperLength - lowerLength) + 1e-6 ||
    reach >= upperLength + lowerLength - 1e-6
  )
    fail("Two-handed wrist target is outside the unstretched arm reach");
  const elbowDegrees = THREE.MathUtils.radToDeg(
    Math.acos(
      THREE.MathUtils.clamp(
        (reach * reach -
          upperLength * upperLength -
          lowerLength * lowerLength) /
          (2 * upperLength * lowerLength),
        -1,
        1,
      ),
    ),
  );
  if (
    elbowDegrees < WIELD_IK_LIMITS.minElbowDegrees ||
    elbowDegrees > WIELD_IK_LIMITS.maxElbowDegrees
  )
    fail("Two-handed wrist target exceeds elbow bend limits");
  direction.normalize();
  const along =
    (upperLength * upperLength - lowerLength * lowerLength + reach * reach) /
    (2 * reach);
  const height = Math.sqrt(
    Math.max(0, upperLength * upperLength - along * along),
  );
  const pole = new THREE.Vector3(side * 0.5, -1, -0.2);
  pole.addScaledVector(direction, -pole.dot(direction));
  if (pole.lengthSq() < 1e-10) fail("Two-handed elbow pole is degenerate");
  pole.normalize();
  const elbow = arm.position
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(pole, height);
  const armRotation = new THREE.Quaternion().setFromUnitVectors(
    upper.clone().normalize(),
    elbow.clone().sub(arm.position).normalize(),
  );
  const lowerAxis = lower.clone().normalize();
  const forearmAbsolute = new THREE.Quaternion()
    .setFromUnitVectors(
      lowerAxis.clone().applyQuaternion(armRotation),
      target.position.clone().sub(elbow).normalize(),
    )
    .multiply(armRotation);
  // Forearm pronation/supination carries axial roll; the wrist receives swing.
  const relative = forearmAbsolute.clone().invert().multiply(target.quaternion);
  const projection = new THREE.Vector3(relative.x, relative.y, relative.z).dot(
    lowerAxis,
  );
  const twist = new THREE.Quaternion(
    lowerAxis.x * projection,
    lowerAxis.y * projection,
    lowerAxis.z * projection,
    relative.w,
  );
  if (twist.lengthSq() > 1e-12) forearmAbsolute.multiply(twist.normalize());
  const wristRotation = forearmAbsolute
    .clone()
    .invert()
    .multiply(target.quaternion)
    .normalize();
  const wristDegrees = THREE.MathUtils.radToDeg(
    wristRotation.angleTo(new THREE.Quaternion()),
  );
  if (wristDegrees > WIELD_IK_LIMITS.maxWristDegrees)
    fail("Two-handed grip frame exceeds wrist bend limits");
  return {
    arm: armRotation,
    forearm: armRotation.clone().invert().multiply(forearmAbsolute),
    wrist: wristRotation,
    upperLength,
    lowerLength,
    reach,
    elbowDegrees,
    wristDegrees,
    elbow,
  };
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

/** Independent hands or one shared two-handed owner, using one avatar pose lease. */
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
    return this.hands[hand]?.views[hand];
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
  private owners(hands = this.hands): Held[] {
    return [
      ...new Set(
        Object.values(hands).filter((entry): entry is Held => !!entry),
      ),
    ];
  }
  private gripFrame(hand: Hand): THREE.Matrix4 {
    const frame = this.library.catalog.grips[hand].frame;
    return new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(frame.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...frame.rotation)),
      new THREE.Vector3(1, 1, 1),
    );
  }
  private async stage(
    hand: Hand,
    itemId: string | null,
  ): Promise<Held | undefined> {
    if (itemId === null) return undefined;
    const item = this.library.catalog.items.find(
      (asset) => asset.id === itemId,
    )!;
    const occupied: readonly Hand[] = item.twoHanded ? HANDS : [hand];
    const results = await Promise.allSettled([
      this.library.instantiate(item),
      ...occupied.map((side) =>
        this.library.instantiate(this.library.catalog.grips[side]),
      ),
    ]);
    const failure = results.find((r) => r.status === "rejected");
    if (failure) {
      for (const result of results)
        if (result.status === "fulfilled") disposeAvatarResources(result.value);
      throw (failure as PromiseRejectedResult).reason;
    }
    const object = (results[0] as PromiseFulfilledResult<THREE.Group>).value;
    const port = new THREE.Group(),
      effects = new THREE.Group();
    port.name = `wield-port-${hand}`;
    port.userData.wieldOwned = true;
    object.name = `wield-${hand}-${item.id}`;
    effects.name = `wield-effects-${hand}`;
    effects.userData.wieldEffect = true;
    effects.userData.comicSkip = true;
    const grips: Held["grips"] = {},
      gripPorts: Held["gripPorts"] = {};
    port.add(object, effects);
    for (let i = 0; i < occupied.length; i++) {
      const side = occupied[i],
        grip = (results[i + 1] as PromiseFulfilledResult<THREE.Group>).value;
      const gripPort = item.twoHanded ? new THREE.Group() : port;
      gripPort.userData.wieldOwned = true;
      if (item.twoHanded) gripPort.name = `wield-grip-port-${side}`;
      gripPort.add(grip);
      grips[side] = grip;
      gripPorts[side] = gripPort;
    }
    const instance: Held = {
      hand,
      object,
      grip: grips[hand]!,
      effects,
      port,
      occupied,
      grips,
      gripPorts,
      views: {},
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
      if (item.twoHanded) {
        instance.physicalAnchors = {
          left: uniqueNode(approvedRoot, item.twoHanded.grips.left),
          right: uniqueNode(approvedRoot, item.twoHanded.grips.right),
        };
      }
      nodes.set(
        "grip",
        instance.physicalAnchors?.[hand] ??
          uniqueNode(approvedRoot, item.gripAnchor),
      );
      for (const [logical, actual] of Object.entries(item.anchors))
        nodes.set(logical, uniqueNode(approvedRoot, actual));
      instance.anchor = (name) =>
        nodes.get(name) ?? fail(`Unknown logical equipment anchor ${name}`);
      object.updateMatrixWorld(true);
      for (const anchor of instance.physicalAnchors
        ? Object.values(instance.physicalAnchors)
        : [instance.anchor("grip")]) {
        const authored = object.matrixWorld
          .clone()
          .invert()
          .multiply(anchor.matrixWorld);
        if (rigidFrame(authored, "Grip anchor").position.length() > 2)
          fail("Grip anchor is outside equipment bounds");
      }
      if (!item.twoHanded) {
        const authored = object.matrixWorld
          .clone()
          .invert()
          .multiply(instance.anchor("grip").matrixWorld);
        this.gripFrame(hand)
          .multiply(authored.invert())
          .decompose(object.position, object.quaternion, object.scale);
      }
      const protectedNodes = new Set<THREE.Object3D>();
      for (const anchor of instance.physicalAnchors
        ? Object.values(instance.physicalAnchors)
        : [instance.anchor("grip")])
        for (
          let node: THREE.Object3D | null = anchor;
          node && node !== port;
          node = node.parent
        )
          protectedNodes.add(node);
      for (const node of protectedNodes)
        instance.gripTransforms.push({
          node,
          parent: node.parent,
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
          scale: node.scale.clone(),
        });
      for (const side of occupied)
        instance.views[side] =
          side === hand
            ? instance
            : {
                object,
                grip: grips[side]!,
                effects,
                item: instance.item,
                get state() {
                  return instance.state;
                },
                get error() {
                  return instance.error;
                },
                anchor: (name) =>
                  name === "grip"
                    ? instance.physicalAnchors![side]
                    : instance.anchor(name),
              };
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
        ["input", "pose", "objectPose", "update", "dispose"].some(
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
  /** Atomic owner replacement: a shared model occupies both physical hand slots. */
  async setLoadout(loadout: WieldLoadout): Promise<boolean> {
    this.assertOpen();
    validateWieldLoadout(loadout, this.library.catalog);
    const approved = structuredClone(loadout),
      generation = ++this.generation;
    const plans = approved.twoHanded
      ? [
          {
            hand: approved.twoHanded.primary,
            item: approved.twoHanded.item,
            shared: true,
          },
        ]
      : HANDS.filter((hand) => approved[hand] !== null).map((hand) => ({
          hand,
          item: approved[hand]!,
          shared: false,
        }));
    const retained = new Map<Hand, Held>();
    for (const plan of plans) {
      const current = this.hands[plan.hand];
      if (
        current &&
        !current.closed &&
        current.state === "ready" &&
        current.hand === plan.hand &&
        current.item.id === plan.item &&
        !!current.item.twoHanded === plan.shared
      )
        retained.set(plan.hand, current);
    }
    if (
      plans.length === this.owners().length &&
      retained.size === plans.length
    ) {
      this.pendingLoad = false;
      return true;
    }
    this.pendingLoad = true;
    let owned: Held[] = [];
    const candidate: Partial<Record<Hand, Held>> = {};
    try {
      const results = await Promise.allSettled(
        plans.map((plan) =>
          retained.has(plan.hand)
            ? Promise.resolve(retained.get(plan.hand)!)
            : this.stage(plan.hand, plan.item),
        ),
      );
      for (let i = 0; i < results.length; i++)
        if (results[i].status === "fulfilled") {
          const instance = (results[i] as PromiseFulfilledResult<Held>).value;
          for (const side of instance.occupied) candidate[side] = instance;
          if (instance !== retained.get(plans[i].hand)) owned.push(instance);
        }
      const failure = results.find((r) => r.status === "rejected");
      if (failure) throw (failure as PromiseRejectedResult).reason;
      if (this.closed || generation !== this.generation) {
        for (const instance of owned) this.destroy(instance);
        return false;
      }
      for (const [hand, instance] of retained)
        if (
          this.hands[hand] !== instance ||
          instance.closed ||
          instance.state !== "ready"
        )
          fail(
            "An unchanged hand failed while equipment was loading; retry the loadout",
          );
      const view = this.avatar.attachmentView();
      if (!view && plans.length)
        fail("Equip items after the avatar appearance is ready");
      if (view) this.validateCandidate(view, candidate);
      const retiring = this.owners().filter(
        (instance) => !this.owners(candidate).includes(instance),
      );
      this.detach();
      this.hands = candidate;
      this.current = approved;
      for (const instance of retiring) this.destroy(instance);
      for (const instance of owned) {
        instance.committed = true;
        instance.sequence = this.inputSequences[instance.hand];
      }
      owned = [];
      if (view) {
        this.attach(view);
        this.avatar.refreshPose();
      }
      return true;
    } catch (error) {
      for (const instance of owned) this.destroy(instance);
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
    for (const instance of this.owners(hands)) {
      if (instance.closed) continue;
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
    for (const instance of this.owners(hands)) {
      if (instance.closed) continue;
      held += instance.item.triangles;
      bytes += instance.item.bytes;
      for (const hand of instance.occupied) {
        for (const part of ["arm", "forearm", "hand"])
          if (!view.sockets.has(`${part}_${hand === "left" ? "L" : "R"}`))
            fail("Incomplete wielding rig");
        held += this.library.catalog.grips[hand].triangles;
        bytes += this.library.catalog.grips[hand].bytes;
      }
      if (instance.item.twoHanded)
        this.sharedSolutions(instance, view, instance.objectMotion);
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
      skinColor(instance.grips[hand]!, view.recipe.colors.skin);
      view.sockets
        .get(hand === "left" ? "hand_L" : "hand_R")!
        .add(instance.gripPorts[hand]!);
    }
    for (const instance of this.owners())
      if (!instance.closed && instance.item.twoHanded) {
        view.sockets.get("chest")!.add(instance.port);
        this.applyShared(instance, view, instance.objectMotion);
      }
    view.root.updateWorldMatrix(true, true);
  }
  detach() {
    for (const [mesh, visible] of this.hiddenHands) {
      coveredRelaxedHands.delete(mesh);
      mesh.visible = visible;
    }
    this.hiddenHands.clear();
    for (const instance of this.owners())
      for (const port of this.ports(instance)) port.removeFromParent();
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
    if (instance.item.twoHanded && hand !== instance.hand && type !== "cancel")
      return;
    if (type === "press" && (this.paused || !this.visible || instance.pressed))
      return;
    if (type === "release" && !instance.pressed) return;
    instance.pressed = type === "press";
    try {
      instance.sequence = this.nextInputSequence(instance.hand);
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
    if (hand !== undefined) {
      this.input(hand, "cancel");
      return;
    }
    for (const instance of this.owners()) this.input(instance.hand, "cancel");
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
      for (const instance of this.owners()) instance.pending = [];
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
  private sharedSolutions(
    instance: Held,
    view: AvatarAttachmentView,
    motion?: WieldObjectPose,
  ) {
    const authored = instance.item.twoHanded!;
    if (
      motion &&
      (typeof motion !== "object" ||
        Object.keys(motion).some(
          (key) => !["position", "rotation"].includes(key),
        ))
    )
      fail("Invalid shared equipment pose delta");
    if (motion?.position)
      validateEuler(motion.position, WIELD_IK_LIMITS.objectTranslation);
    if (motion?.rotation)
      validateEuler(motion.rotation, WIELD_IK_LIMITS.objectRotation);
    const position = new THREE.Vector3()
      .fromArray(authored.hold.position)
      .add(new THREE.Vector3().fromArray(motion?.position ?? [0, 0, 0]));
    const quaternion = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(...authored.hold.rotation))
      .multiply(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(...(motion?.rotation ?? [0, 0, 0])),
        ),
      );
    const matrix = new THREE.Matrix4().compose(
      position,
      quaternion,
      new THREE.Vector3(1, 1, 1),
    );
    const chest = view.sockets.get("chest");
    if (!chest) fail("Two-handed equipment requires a chest socket");
    chest.updateWorldMatrix(true, false);
    this.validateGripTransforms(instance);
    const solutions = {} as Record<Hand, WieldArmSolution>;
    for (const hand of HANDS) {
      const chain: THREE.Object3D[] = [];
      let node: THREE.Object3D | null = instance.physicalAnchors![hand];
      while (node && node !== instance.port) {
        chain.unshift(node);
        node = node.parent;
      }
      if (node !== instance.port)
        fail("Two-handed grip left its owned object hierarchy");
      const relative = new THREE.Matrix4();
      for (const part of chain) {
        part.updateMatrix();
        relative.multiply(part.matrix);
      }
      const target = chest.matrixWorld
        .clone()
        .multiply(matrix)
        .multiply(relative)
        .multiply(this.gripFrame(hand).invert());
      solutions[hand] = solveWieldArm(view, hand, target);
    }
    return { position, quaternion, solutions };
  }
  private applyShared(
    instance: Held,
    view: AvatarAttachmentView,
    motion?: WieldObjectPose,
  ) {
    // Solve the complete pair first. No partial arm mutation survives failed reach.
    const result = this.sharedSolutions(instance, view, motion);
    instance.port.position.copy(result.position);
    instance.port.quaternion.copy(result.quaternion);
    for (const hand of HANDS) {
      const suffix = hand === "left" ? "L" : "R",
        solution = result.solutions[hand];
      view.sockets.get(`arm_${suffix}`)!.quaternion.copy(solution.arm);
      view.sockets.get(`forearm_${suffix}`)!.quaternion.copy(solution.forearm);
      view.sockets.get(`hand_${suffix}`)!.quaternion.copy(solution.wrist);
    }
    instance.objectMotion = motion ? structuredClone(motion) : undefined;
  }
  pose(frame: AvatarPoseFrame, view: AvatarAttachmentView) {
    this.frame = frame;
    if (frame.interrupted) this.cancel();
    if (!this.visible) return;
    for (const instance of this.owners()) {
      if (instance.closed) continue;
      try {
        if (instance.item.twoHanded) {
          const motion = instance.behavior?.objectPose?.(
            this.behaviorFrame(instance, frame),
          );
          this.applyShared(instance, view, motion || undefined);
          continue;
        }
        const hand = instance.hand,
          pose = instance.item.pose[hand];
        const delta = instance.behavior?.pose?.(
          this.behaviorFrame(instance, frame),
        );
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
        for (const part of ["arm", "forearm", "wrist"] as const) {
          const node = view.sockets.get(
            `${part === "wrist" ? "hand" : part}_${hand === "left" ? "L" : "R"}`,
          )!;
          const angles = pose[part].map(
            (angle, i) => angle + (delta?.[part]?.[i] ?? 0),
          );
          node.rotation.set(angles[0], angles[1], angles[2]);
        }
      } catch (error) {
        this.breakHand(instance, error);
      }
    }
  }
  update(frame: AvatarPoseFrame, view: AvatarAttachmentView) {
    if (!this.visible) return;
    for (const instance of this.owners()) {
      if (instance.state !== "ready" || instance.closed) continue;
      const hand = instance.hand;
      try {
        if (!this.paused) instance.elapsed += frame.dt;
        instance.behavior?.update?.(this.behaviorFrame(instance, frame));
        this.validateGripTransforms(instance);
        const effects = this.effectBudget();
        let held = 0;
        for (const entry of this.owners())
          if (!entry.closed) {
            const actual =
              count(entry.object) +
              entry.occupied.reduce(
                (total, hand) => total + count(entry.grips[hand]!),
                0,
              );
            const approved =
              entry.item.triangles +
              entry.occupied.reduce(
                (total, hand) =>
                  total + this.library.catalog.grips[hand].triangles,
                0,
              );
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
        rest.node.parent !== rest.parent ||
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
  private restoreGripTransforms(instance: Held) {
    for (const rest of instance.gripTransforms) {
      if (rest.node.parent !== rest.parent) {
        if (rest.parent) rest.parent.add(rest.node);
        else rest.node.removeFromParent();
      }
      rest.node.position.copy(rest.position);
      rest.node.quaternion.copy(rest.quaternion);
      rest.node.scale.copy(rest.scale);
    }
  }
  private breakHand(instance: Held, error: unknown) {
    if (instance.state === "error") return;
    instance.state = "error";
    instance.error = error;
    instance.pressed = false;
    this.events = Math.max(0, this.events - instance.pending.length);
    instance.pending = [];
    this.restoreGripTransforms(instance);
    if (this.view)
      for (const hand of instance.occupied)
        for (const mesh of this.relaxedHands(this.view, hand)) {
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
    if (this.view) this.avatar.refreshPose();
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
    // Recover protected descendants removed by an extension before collecting resources.
    this.restoreGripTransforms(instance);
    this.events = Math.max(0, this.events - instance.pending.length);
    instance.pending = [];
    for (const port of this.ports(instance)) {
      port.removeFromParent();
      disposeAvatarResources(port);
      port.clear();
    }
  }
  private ports(instance: Held): THREE.Group[] {
    return [...new Set([instance.port, ...Object.values(instance.gripPorts)])];
  }
  private destroyHands(hands: Partial<Record<Hand, Held>>) {
    for (const instance of this.owners(hands)) this.destroy(instance);
  }
  diagnostics() {
    const view = this.avatar.attachmentView();
    const appearance = view
      ? this.appearanceBudget(view, this.hands)
      : { appearance: 0, visibleAppearance: 0, replacedTriangles: 0 };
    let held = 0,
      heldBytes = 0,
      equippedHands = 0;
    for (const instance of this.owners())
      if (!instance.closed) {
        held += instance.item.triangles;
        heldBytes += instance.item.bytes;
        for (const hand of instance.occupied) {
          held += this.library.catalog.grips[hand].triangles;
          heldBytes += this.library.catalog.grips[hand].bytes;
          equippedHands++;
        }
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
