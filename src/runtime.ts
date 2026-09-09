import * as THREE from "three";
import { applyExpressionProjection } from "./expression.js";
import { applyBodyShape } from "./body-shape.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { fitAssembly } from "./fitting.js";
import {
  AvatarError,
  inspectGlb,
  selectedAssets,
  validateCatalog,
  validateRecipe,
  type Catalog,
  type Recipe,
  type Asset,
} from "./core.js";
/** Generic presentation pose; physical translation/jumps remain application-owned. */
export type AvatarActionPose = {
  crouch?: number;
  /** Signed forward lean. */
  lean?: number;
  stance?: number;
  tuck?: number;
  recoil?: number;
};
export type Motion = {
  speed?: number;
  gesture?: "idle" | "walk" | "wave" | "run";
  reducedMotion?: boolean;
  /** Metres/second in avatar-facing space (+X right, +Z forward). Supplying
   * velocity enables world-space stance contacts; speed-only previews use a treadmill. */
  velocity?: { x: number; z: number };
  grounded?: boolean;
  pose?: AvatarActionPose;
};
type AnimatedFoot = {
  contact: boolean;
  initialized: boolean;
  target: THREE.Vector3;
  start: THREE.Vector3;
  phase: number;
  knee: number;
};
const animationScalar = (
  value: number | undefined,
  min: number,
  max: number,
) => {
  if (value === undefined) return 0;
  if (!Number.isFinite(value))
    throw new AvatarError("animation", "Animation inputs must be finite");
  return THREE.MathUtils.clamp(value, min, max);
};
/** Positive knee pole and flat sole frame; joint translations/scales never stretch. */
function poseLeg(
  hips: THREE.Bone,
  thigh: THREE.Bone,
  shin: THREE.Bone,
  foot: THREE.Bone,
  targetWorld: THREE.Vector3,
  toeLift: number,
): number {
  hips.updateWorldMatrix(true, false);
  const target = hips.worldToLocal(targetWorld.clone());
  const upper = shin.position.clone(),
    lower = foot.position.clone(),
    a = upper.length(),
    b = lower.length();
  const direction = target.sub(thigh.position),
    distance = direction.length();
  const reach = THREE.MathUtils.clamp(
    distance,
    Math.abs(a - b) + 0.005,
    a + b - 0.0001,
  );
  direction.normalize();
  const along = (a * a - b * b + reach * reach) / (2 * reach),
    height = Math.sqrt(Math.max(0, a * a - along * along));
  const pole = new THREE.Vector3(thigh.position.x < 0 ? -0.12 : 0.12, 0, 1)
    .addScaledVector(
      direction,
      -new THREE.Vector3(thigh.position.x < 0 ? -0.12 : 0.12, 0, 1).dot(
        direction,
      ),
    )
    .normalize();
  const elbow = direction
    .clone()
    .multiplyScalar(along)
    .addScaledVector(pole, height);
  const upperRotation = new THREE.Quaternion().setFromUnitVectors(
    upper.normalize(),
    elbow.clone().normalize(),
  );
  const lowerRotation = new THREE.Quaternion()
    .setFromUnitVectors(
      lower.normalize().applyQuaternion(upperRotation),
      direction.clone().multiplyScalar(reach).sub(elbow).normalize(),
    )
    .multiply(upperRotation);
  thigh.quaternion.copy(upperRotation);
  shin.quaternion.copy(upperRotation.clone().invert().multiply(lowerRotation));
  foot.quaternion.copy(
    lowerRotation
      .clone()
      .invert()
      .multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-toeLift, 0, 0)),
      ),
  );
  return THREE.MathUtils.radToDeg(
    Math.acos(
      THREE.MathUtils.clamp(
        (reach * reach - a * a - b * b) / (2 * a * b),
        -1,
        1,
      ),
    ),
  );
}
const imageReferences = new WeakMap<object, number>();
const ownedTextures = new WeakSet<THREE.Texture>();
const templateTextures = new WeakMap<THREE.Object3D, Set<THREE.Texture>>();
const disposedRoots = new WeakSet<THREE.Object3D>();
function ownTexture(texture: THREE.Texture) {
  if (ownedTextures.has(texture)) return texture;
  ownedTextures.add(texture);
  const image = texture.image;
  if (image && typeof image.close === "function")
    imageReferences.set(image, (imageReferences.get(image) ?? 0) + 1);
  const onDispose = () => {
    texture.removeEventListener("dispose", onDispose);
    if (
      !ownedTextures.delete(texture) ||
      !image ||
      typeof image.close !== "function"
    )
      return;
    const remaining = (imageReferences.get(image) ?? 1) - 1;
    if (remaining > 0) imageReferences.set(image, remaining);
    else {
      imageReferences.delete(image);
      image.close();
    }
  };
  // Scene consumers may dispose Three resources directly instead of retaining
  // an AvatarInstance handle. The texture event is the common ownership edge.
  texture.addEventListener("dispose", onDispose);
  return texture;
}
function releaseTexture(texture: THREE.Texture) {
  texture.dispose();
}
export function disposeAvatarResources(root: THREE.Object3D) {
  if (disposedRoots.has(root)) return;
  disposedRoots.add(root);
  // Render styles release their derived resources and restore source materials
  // before this owner collects geometry/materials. Never serialize this callback.
  const styled: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) styled.push(o);
  });
  for (const mesh of styled)
    if (typeof mesh.userData.beforeAvatarDispose === "function")
      mesh.userData.beforeAvatarDispose();
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>(templateTextures.get(root)),
    skeletons = new Set<THREE.Skeleton>(),
    instances = new Set<THREE.InstancedMesh>(),
    lights = new Set<THREE.Light>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
      if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton);
      if (o instanceof THREE.InstancedMesh) instances.add(o);
    }
    if (o instanceof THREE.Light) lights.add(o);
  });
  for (const instance of instances) instance.dispose();
  for (const light of lights) light.dispose();
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const value of Object.values(m))
      if (value instanceof THREE.Texture) textures.add(value);
    m.dispose();
  }
  for (const texture of textures) releaseTexture(texture);
  for (const skeleton of skeletons) skeleton.dispose();
  templateTextures.delete(root);
}
const dispose = disposeAvatarResources;

export type Assembly = {
  root: THREE.Group;
  sockets: Map<string, THREE.Bone>;
  effects: { object: THREE.Object3D; kind: string }[];
};
export class VerifiedAssetLibrary {
  protected cache = new Map<string, Promise<THREE.Group>>();
  // A synchronous prepared factory cannot refetch an evicted image. Keep its
  // template lease until library disposal; one entry per approved catalog asset.
  protected preparedTemplates = new Map<string, Promise<THREE.Group>>();
  protected assemblyLeases = new Map<Promise<THREE.Group>, number>();
  protected retiredTemplates = new Set<Promise<THREE.Group>>();
  private controllers = new Set<AbortController>();
  protected closed = false;
  constructor(
    readonly baseUrl: string,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  protected load(asset: Asset, prepare = false): Promise<THREE.Group> {
    const key = `${asset.id}:${asset.sha256}`;
    if (this.closed)
      return Promise.reject(
        new AvatarError("disposed", "Avatar library is disposed"),
      );
    const pinned = this.preparedTemplates.get(key);
    if (pinned) return pinned;
    const cached = this.cache.get(key);
    if (cached) {
      if (prepare) this.preparedTemplates.set(key, cached);
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    const work = (async () => {
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await this.fetcher(new URL(asset.url, this.baseUrl), {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new AvatarError(
            "load",
            `${asset.label} could not load (${response.status})`,
          );
        const reader = response.body?.getReader();
        if (!reader)
          throw new AvatarError("load", "Asset response has no body");
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > asset.bytes) {
            await reader.cancel();
            throw new AvatarError("asset", "Asset exceeds approved size");
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let at = 0;
        for (const c of chunks) {
          bytes.set(c, at);
          at += c.byteLength;
        }
        inspectGlb(bytes.buffer, asset);
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        )
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        if (hash !== asset.sha256)
          throw new AvatarError(
            "integrity",
            `${asset.label} does not match the approved asset`,
          );
        const manager = new THREE.LoadingManager(),
          temporaryUrls = new Set<string>();
        manager.setURLModifier((url) => {
          if (url.startsWith("blob:")) temporaryUrls.add(url);
          return url;
        });
        let scene: THREE.Group | undefined;
        try {
          const parsed = await new GLTFLoader(manager).parseAsync(
            bytes.buffer,
            "",
          );
          scene = parsed.scene;
          // GLTFLoader turns a failed image decode into a null material map.
          // Artwork must instead fail atomically with the rest of the asset.
          const artwork = await parsed.parser.getDependencies("texture");
          const textures = new Set<THREE.Texture>(artwork.filter(Boolean));
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              for (const value of Object.values(material))
                if (value instanceof THREE.Texture) textures.add(value);
          });
          for (const texture of textures) ownTexture(texture);
          templateTextures.set(scene, textures);
          if (artwork.some((texture: THREE.Texture | null) => !texture?.image))
            throw new AvatarError(
              "texture",
              `${asset.label} artwork could not decode`,
            );
          if (this.closed)
            throw new AvatarError("disposed", "Avatar library is disposed");
          return scene;
        } catch (error) {
          if (scene) dispose(scene);
          throw error;
        } finally {
          // The loader revokes successful images itself; its failure path does
          // not. Revoking again is safe and bounds repeated decode failures.
          for (const url of temporaryUrls) URL.revokeObjectURL(url);
        }
      } finally {
        clearTimeout(timeout);
        this.controllers.delete(controller);
      }
    })();
    this.cache.set(key, work);
    if (prepare) this.preparedTemplates.set(key, work);
    void work.catch(() => {
      if (this.cache.get(key) === work) this.cache.delete(key);
      if (this.preparedTemplates.get(key) === work)
        this.preparedTemplates.delete(key);
    });
    // Templates never enter a live scene. Instances own their geometry and materials.
    if (this.cache.size > 32) {
      const [key, old] = this.cache.entries().next().value!;
      this.cache.delete(key);
      if (this.preparedTemplates.get(key) !== old) {
        if (this.assemblyLeases.has(old)) this.retiredTemplates.add(old);
        else void old.then(dispose, () => {});
      }
    }
    return work;
  }
  /** Each instance owns its geometry, materials and image leases. */
  protected async instantiateAsset(asset: Asset): Promise<THREE.Group> {
    const request = this.load(asset);
    this.assemblyLeases.set(
      request,
      (this.assemblyLeases.get(request) ?? 0) + 1,
    );
    let result: THREE.Group | undefined;
    try {
      const source = await request;
      if (this.closed)
        throw new AvatarError("disposed", "Asset library is disposed");
      source.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh)
          throw new AvatarError(
            "asset",
            "Rigid equipment must not contain a skin",
          );
      });
      result = source.clone(true);
      const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
      const materials = new Map<THREE.Material, THREE.Material>();
      const textures = new Map<THREE.Texture, THREE.Texture>();
      result.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object instanceof THREE.SkinnedMesh)
          throw new AvatarError(
            "asset",
            "Rigid equipment must not contain a skin",
          );
        const geometry = object.geometry;
        if (!geometries.has(geometry))
          geometries.set(geometry, geometry.clone());
        object.geometry = geometries.get(geometry)!;
        const cloneMaterial = (source: THREE.Material) => {
          if (!materials.has(source)) {
            const material = source.clone();
            for (const [key, value] of Object.entries(source)) {
              if (!(value instanceof THREE.Texture)) continue;
              if (!textures.has(value))
                textures.set(value, ownTexture(value.clone()));
              (material as unknown as Record<string, unknown>)[key] =
                textures.get(value)!;
            }
            materials.set(source, material);
          }
          return materials.get(source)!;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(cloneMaterial)
          : cloneMaterial(object.material);
      });
      return result;
    } catch (error) {
      // Only completed clones may own resources; structural validation occurs
      // before cloning, so no shared template geometry enters this disposal path.
      if (result) dispose(result);
      throw error;
    } finally {
      const remaining = (this.assemblyLeases.get(request) ?? 1) - 1;
      if (remaining > 0) this.assemblyLeases.set(request, remaining);
      else {
        this.assemblyLeases.delete(request);
        if (this.retiredTemplates.delete(request))
          void request.then(dispose, () => {});
      }
    }
  }
  diagnostics() {
    return {
      cachedAssets: this.cache.size,
      preparedAssets: this.preparedTemplates.size,
      pendingRequests: this.controllers.size,
    };
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.controllers) c.abort();
    for (const value of new Set([
      ...this.cache.values(),
      ...this.preparedTemplates.values(),
      ...this.retiredTemplates,
    ]))
      void value.then(dispose, () => {});
    this.cache.clear();
    this.preparedTemplates.clear();
    this.retiredTemplates.clear();
  }
}
export class AvatarLibrary extends VerifiedAssetLibrary {
  readonly catalog: Catalog;
  constructor(catalog: unknown, baseUrl: string, fetcher?: typeof fetch) {
    super(baseUrl, fetcher);
    validateCatalog(catalog);
    this.catalog = structuredClone(catalog);
  }
  async assemble(recipe: Recipe): Promise<Assembly> {
    validateRecipe(recipe, this.catalog);
    const assets = selectedAssets(recipe, this.catalog);
    const requests = assets.map((asset) => {
      const request = this.load(asset);
      this.assemblyLeases.set(
        request,
        (this.assemblyLeases.get(request) ?? 0) + 1,
      );
      return request;
    });
    try {
      const loaded = await Promise.allSettled(requests);
      const failure = loaded.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      if (failure) throw failure.reason;
      const models = loaded.map(
        (r) => (r as PromiseFulfilledResult<THREE.Group>).value,
      );
      if (this.closed)
        throw new AvatarError("disposed", "Avatar library is disposed");
      return this.assembleModels(recipe, assets, models);
    } finally {
      for (const request of requests) {
        const remaining = (this.assemblyLeases.get(request) ?? 1) - 1;
        if (remaining > 0) this.assemblyLeases.set(request, remaining);
        else {
          this.assemblyLeases.delete(request);
          if (this.retiredTemplates.delete(request))
            void request.then(dispose, () => {});
        }
      }
    }
  }
  private assembleModels(
    recipe: Recipe,
    assets: Asset[],
    models: THREE.Group[],
  ): Assembly {
    const root = new THREE.Group();
    root.name = "Avatar";
    const sockets = new Map<string, THREE.Bone>();
    for (const s of this.catalog.rig.sockets) {
      const node = new THREE.Bone();
      node.name = s.id;
      node.position.fromArray(s.position);
      (s.parent ? sockets.get(s.parent)! : root).add(node);
      sockets.set(s.id, node);
    }
    root.updateMatrixWorld(true);
    const coveredRegions = new Set(
      assets.flatMap((asset) => asset.covers ?? []),
    );
    const effects: Assembly["effects"] = [];
    try {
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i],
          model = models[i];
        const geometries = new Map<
            THREE.BufferGeometry,
            THREE.BufferGeometry
          >(),
          materials = new Map<THREE.Material, THREE.Material>(),
          textures = new Map<THREE.Texture, THREE.Texture>();
        model.updateMatrixWorld(true);
        for (const mount of asset.attachments) {
          const source = model.getObjectByName(mount.node);
          if (!source)
            throw new AvatarError("attachment", `Missing ${mount.node}`);
          const object = asset.skin
            ? cloneSkeleton(source)
            : source.clone(true);
          object.name = `part:${asset.id}:${mount.socket}`;
          object.userData.assetId = asset.id;
          if (asset.skin) {
            // Retain the export's complete root-space placement even if the
            // attachment was nested beneath a transformed authoring container.
            const transform = sockets
              .get(mount.socket)!
              .matrixWorld.clone()
              .invert()
              .multiply(source.matrixWorld);
            transform.decompose(
              object.position,
              object.quaternion,
              object.scale,
            );
          }
          sockets.get(mount.socket)!.add(object);
          root.updateMatrixWorld(true);
          const skeletons = new Map<THREE.Skeleton, THREE.Skeleton>();
          object.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              if (
                asset.slot === "body" &&
                coveredRegions.has(o.userData.avatarRegion)
              )
                o.visible = false;
              if (!geometries.has(o.geometry))
                geometries.set(o.geometry, o.geometry.clone());
              o.geometry = geometries.get(o.geometry)!;
              const copy = (m: THREE.Material) => {
                if (!materials.has(m)) {
                  const cloned = m.clone();
                  for (const [key, value] of Object.entries(m)) {
                    if (!(value instanceof THREE.Texture)) continue;
                    if (!textures.has(value))
                      textures.set(value, ownTexture(value.clone()));
                    (cloned as any)[key] = textures.get(value)!;
                  }
                  const color = recipe.colors[m.name];
                  if (
                    color &&
                    asset.channels.includes(m.name) &&
                    (cloned as THREE.MeshStandardMaterial).color
                  )
                    (cloned as THREE.MeshStandardMaterial).color.set(color);
                  applyExpressionProjection(cloned);
                  materials.set(m, cloned);
                }
                return materials.get(m)!;
              };
              o.material = Array.isArray(o.material)
                ? o.material.map(copy)
                : copy(o.material);
              o.castShadow = true;
              o.receiveShadow = true;
              if (o instanceof THREE.SkinnedMesh) {
                if (!asset.skin)
                  throw new AvatarError(
                    "skin",
                    "Skinned meshes require a declared rig contract",
                  );
                const native = o.skeleton;
                if (!skeletons.has(native)) {
                  const bones = native.bones.map((bone) => {
                    const shared = sockets.get(bone.name);
                    if (
                      !shared ||
                      !asset.skin!.bones.includes(bone.name) ||
                      new THREE.Vector3()
                        .setFromMatrixPosition(bone.matrixWorld)
                        .distanceTo(
                          new THREE.Vector3().setFromMatrixPosition(
                            shared.matrixWorld,
                          ),
                        ) > 0.002
                    )
                      throw new AvatarError(
                        "skin",
                        "Skin joint rest positions differ from the catalog rig",
                      );
                    return shared;
                  });
                  // The exported inverse binds include Blender's bone bases.
                  // Preserve their rest result, then apply the shared rig's pose
                  // delta. This supports arbitrary authoring bone orientations.
                  const inverses = bones.map((bone, index) =>
                    bone.matrixWorld
                      .clone()
                      .invert()
                      .multiply(native.bones[index].matrixWorld)
                      .multiply(native.boneInverses[index]),
                  );
                  skeletons.set(native, new THREE.Skeleton(bones, inverses));
                }
                const indices = o.geometry.getAttribute("skinIndex"),
                  weights = o.geometry.getAttribute("skinWeight");
                if (!indices || !weights || indices.count !== weights.count)
                  throw new AvatarError("skin", "Missing skin influences");
                for (let vertex = 0; vertex < indices.count; vertex++) {
                  let sum = 0;
                  for (let component = 0; component < 4; component++) {
                    const index = indices.getComponent(vertex, component),
                      weight = weights.getComponent(vertex, component);
                    if (
                      !Number.isInteger(index) ||
                      index < 0 ||
                      index >= native.bones.length ||
                      !Number.isFinite(weight) ||
                      weight < 0 ||
                      weight > 1
                    )
                      throw new AvatarError(
                        "skin",
                        "Invalid joint index or weight",
                      );
                    sum += weight;
                  }
                  if (Math.abs(sum - 1) > 0.002)
                    throw new AvatarError(
                      "skin",
                      "Skin weights must sum to one",
                    );
                }
                o.bind(skeletons.get(native)!, o.bindMatrix);
                // A posed hand can move beyond the bind-pose bounds. Recompute
                // accurate bounds only when a caller requests them; do not cull
                // this small mesh using stale bounds during animation.
                o.frustumCulled = false;
              }
            }
          });
          if (asset.effect) effects.push({ object, kind: asset.effect });
        }
      }
      if (assets.some((asset) => asset.fit || asset.hairFit))
        fitAssembly(
          root,
          assets,
          sockets.get("head")!,
          this.catalog.budgets.maxTriangles,
        );
      if (this.catalog.bodyShape)
        applyBodyShape(
          root,
          sockets,
          this.catalog.bodyShape,
          recipe.body?.weight ?? 0,
        );
      return { root, sockets, effects };
    } catch (error) {
      dispose(root);
      throw error;
    }
  }
  /** Preload an approved look, then create instances synchronously for world visual factories. */
  async prepare(recipe: Recipe): Promise<() => AvatarInstance> {
    const approved = structuredClone(recipe),
      assets = selectedAssets(approved, this.catalog);
    const loaded = await Promise.allSettled(
      assets.map((a) => this.load(a, true)),
    );
    const failure = loaded.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failure) throw failure.reason;
    if (this.closed)
      throw new AvatarError("disposed", "Avatar library is disposed");
    const models = loaded.map(
      (r) => (r as PromiseFulfilledResult<THREE.Group>).value,
    );
    return () => {
      if (this.closed)
        throw new AvatarError("disposed", "Avatar library is disposed");
      return new AvatarInstance(this, {
        assembly: this.assembleModels(approved, assets, models),
        recipe: approved,
      });
    };
  }
  create(): AvatarInstance {
    if (this.closed)
      throw new AvatarError("disposed", "Avatar library is disposed");
    return new AvatarInstance(this);
  }
}
/** One exclusive equipment layer owns both wrist ports and their pose lifecycle. */
export type AvatarAttachmentView = {
  root: THREE.Group;
  sockets: ReadonlyMap<string, THREE.Bone>;
  recipe: Recipe;
  rig: string;
};
export type AvatarPoseFrame = {
  time: number;
  dt: number;
  interrupted: boolean;
  reducedMotion: boolean;
};
export interface AvatarHandLayer {
  validate(view: AvatarAttachmentView): void;
  attach(view: AvatarAttachmentView): void;
  detach(): void;
  pose(frame: AvatarPoseFrame, view: AvatarAttachmentView): void;
  update(frame: AvatarPoseFrame, view: AvatarAttachmentView): void;
  dispose(): void;
}
export class AvatarInstance {
  readonly object = new THREE.Group();
  private assembly?: Assembly;
  private current?: Recipe;
  private generation = 0;
  private closed = false;
  private phase = 0;
  private gaitVelocity = new THREE.Vector2();
  private poseValues = { crouch: 0, lean: 0, stance: 0, tuck: 0, recoil: 0 };
  private feet: Record<"left" | "right", AnimatedFoot> = {
    left: {
      contact: true,
      initialized: false,
      target: new THREE.Vector3(),
      start: new THREE.Vector3(),
      phase: 0,
      knee: 0,
    },
    right: {
      contact: true,
      initialized: false,
      target: new THREE.Vector3(),
      start: new THREE.Vector3(),
      phase: 0.5,
      knee: 0,
    },
  };
  private previousGrounded = true;
  private previousOrigin?: THREE.Vector3;
  private lastTime?: number;
  private lastMotion: Motion = {};
  private refreshingPose = false;
  private handLayer?: AvatarHandLayer;
  private poseView?: AvatarAttachmentView;
  constructor(
    private library: AvatarLibrary,
    initial?: { assembly: Assembly; recipe: Recipe },
  ) {
    this.object.name = "ModularAvatar";
    if (initial) {
      this.assembly = initial.assembly;
      this.current = structuredClone(initial.recipe);
      this.object.add(initial.assembly.root);
      this.poseView = this.attachmentView();
    }
  }
  get recipe() {
    return this.current ? structuredClone(this.current) : undefined;
  }
  get rig() {
    return this.library.catalog.rig.id;
  }
  attachmentView(): AvatarAttachmentView | undefined {
    return this.assembly && this.current
      ? {
          root: this.assembly.root,
          sockets: this.assembly.sockets,
          recipe: structuredClone(this.current),
          rig: this.rig,
        }
      : undefined;
  }
  /** The lease must be released before another controller may own the wrists. */
  claimHandLayer(layer: AvatarHandLayer): () => void {
    if (this.closed) throw new AvatarError("disposed", "Avatar is disposed");
    if (this.handLayer)
      throw new AvatarError("wield", "Avatar already has a hand controller");
    const view = this.attachmentView();
    if (view) {
      layer.validate(view);
      layer.attach(view);
    }
    this.handLayer = layer;
    return () => {
      if (this.handLayer !== layer) return;
      layer.detach();
      this.handLayer = undefined;
      this.refreshPose();
    };
  }
  /** Latest request wins; prior appearance remains intact on load/validation failure. */
  async setAppearance(recipe: Recipe): Promise<boolean> {
    if (this.closed) throw new AvatarError("disposed", "Avatar is disposed");
    validateRecipe(recipe, this.library.catalog);
    const requested = structuredClone(recipe),
      generation = ++this.generation;
    const next = await this.library.assemble(requested);
    if (this.closed || generation !== this.generation) {
      dispose(next.root);
      return false;
    }
    const view: AvatarAttachmentView = {
      root: next.root,
      sockets: next.sockets,
      recipe: requested,
      rig: this.rig,
    };
    try {
      this.handLayer?.validate(view);
    } catch (error) {
      dispose(next.root);
      throw error;
    }
    this.handLayer?.detach();
    if (this.assembly) {
      this.object.remove(this.assembly.root);
      dispose(this.assembly.root);
    }
    this.assembly = next;
    this.current = requested;
    this.object.add(next.root);
    this.poseView = view;
    this.handLayer?.attach(view);
    this.refreshPose();
    return true;
  }
  /** Reapply the last base motion and equipment pose without advancing behavior time. */
  refreshPose() {
    if (this.refreshingPose || this.closed || !this.assembly) return;
    this.refreshingPose = true;
    const previousTime = this.lastTime;
    try {
      this.update(previousTime ?? 0, this.lastMotion);
    } finally {
      // A visual refresh must not start the application clock before its first tick.
      this.lastTime = previousTime;
      this.refreshingPose = false;
    }
  }
  update(time: number, motion: Motion = {}) {
    if (!this.assembly || this.closed) return;
    if (!Number.isFinite(time)) {
      const view = this.poseView!;
      this.handLayer?.pose(
        {
          time: this.lastTime ?? 0,
          dt: 0,
          interrupted: true,
          reducedMotion: true,
        },
        view,
      );
      return;
    }
    const firstFrame = this.lastTime === undefined;
    const requestedPose = Object.fromEntries(
      ["crouch", "lean", "stance", "tuck", "recoil"].map((key) => [
        key,
        animationScalar(
          motion.pose?.[key as keyof AvatarActionPose],
          key === "lean" ? -1 : 0,
          1,
        ),
      ]),
    ) as Required<AvatarActionPose>;
    const requestedSpeed = animationScalar(
      motion.speed ??
        (motion.gesture === "walk" ? 0.65 : motion.gesture === "run" ? 1 : 0),
      0,
      1,
    );
    const requestedVelocity = motion.velocity
      ? new THREE.Vector2(
          animationScalar(motion.velocity.x, -8, 8),
          animationScalar(motion.velocity.z, -8, 8),
        )
      : new THREE.Vector2(0, requestedSpeed * 4);
    const interrupted =
      this.lastTime !== undefined &&
      (time - this.lastTime > 0.25 || time < this.lastTime);
    const dt =
      this.lastTime === undefined
        ? 0
        : Math.max(0, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;
    this.lastMotion = {
      ...motion,
      velocity: motion.velocity && { ...motion.velocity },
      pose: motion.pose && { ...motion.pose },
    };
    const { sockets, effects } = this.assembly;
    for (const s of sockets.values()) s.rotation.set(0, 0, 0);
    if (requestedVelocity.length() > 8) requestedVelocity.setLength(8);
    const blend = this.refreshingPose ? 0 : 1 - Math.exp(-12 * dt);
    const poseBlend = this.refreshingPose ? 0 : 1 - Math.exp(-20 * dt);
    if (motion.reducedMotion) this.gaitVelocity.set(0, 0);
    else this.gaitVelocity.lerp(requestedVelocity, blend);
    for (const key of ["crouch", "lean", "stance", "tuck", "recoil"] as const) {
      const value = requestedPose[key];
      this.poseValues[key] =
        motion.reducedMotion || firstFrame
          ? value
          : THREE.MathUtils.lerp(this.poseValues[key], value, poseBlend);
    }
    const gaitSpeed = Math.min(1, this.gaitVelocity.length() / 4),
      frequency =
        (1.25 + 1.15 * gaitSpeed) *
        (1 +
          (0.7 * Math.abs(this.gaitVelocity.x)) /
            Math.max(0.001, this.gaitVelocity.length()));
    if (
      !this.refreshingPose &&
      !motion.reducedMotion &&
      (motion.grounded ?? true)
    )
      this.phase =
        (this.phase +
          dt * frequency * Math.min(1, this.gaitVelocity.length() / 0.3)) %
        1;
    const swing = Math.sin(this.phase * Math.PI * 2) * 0.55 * gaitSpeed;
    this.assembly.root.position.y = -(
      this.poseValues.crouch * 0.55 +
      (motion.reducedMotion ? 0 : 0.12 * gaitSpeed) +
      (motion.reducedMotion ? 0 : (0.018 * Math.abs(this.gaitVelocity.x)) / 4) +
      this.poseValues.recoil * 0.035
    );
    const rotate = (name: string, x: number, z = 0) => {
      const n = sockets.get(name);
      if (n) n.rotation.set(x, 0, z);
    };
    this.poseFeet(motion, dt, frequency, interrupted);
    rotate(
      "chest",
      this.poseValues.lean * 0.36 - this.poseValues.recoil * 0.12,
    );
    const forward =
      this.gaitVelocity.y / Math.max(0.001, this.gaitVelocity.length());
    const lateral =
      this.gaitVelocity.x / Math.max(0.001, this.gaitVelocity.length());
    rotate("arm_L", -swing * 1.35 * forward, -0.14 + swing * 0.4 * lateral);
    rotate("arm_R", swing * 1.35 * forward, 0.14 + swing * 0.4 * lateral);
    rotate("forearm_L", -0.1 - Math.max(0, swing * forward) * 0.7);
    rotate("forearm_R", -0.1 - Math.max(0, -swing * forward) * 0.7);
    if (motion.gesture === "wave") {
      rotate("arm_R", -2.7, 0.55);
      rotate(
        "forearm_R",
        motion.reducedMotion ? -0.2 : -0.2 + Math.sin(time * 7) * 0.16,
      );
    }
    rotate(
      "head",
      -this.poseValues.lean * 0.12,
      motion.reducedMotion ? 0 : Math.sin(time * 1.5) * 0.016,
    );
    for (const e of effects) {
      e.object.rotation.y = motion.reducedMotion
        ? 0
        : time * (e.kind === "orbit" ? 0.5 : 0.25);
    }
    const view = this.poseView!;
    const frame = {
      time,
      dt,
      interrupted,
      reducedMotion: !!motion.reducedMotion,
    };
    this.handLayer?.pose(frame, view);
    this.object.updateMatrixWorld(true);
    if (!this.refreshingPose) this.handLayer?.update(frame, view);
  }
  private poseFeet(
    motion: Motion,
    dt: number,
    frequency: number,
    interrupted: boolean,
  ) {
    const view = this.poseView!,
      hips = view.sockets.get("hips");
    if (
      !hips ||
      !["leg_L", "shin_L", "foot_L", "leg_R", "shin_R", "foot_R"].every((id) =>
        view.sockets.has(id),
      )
    ) {
      if (motion.velocity || motion.pose)
        throw new AvatarError(
          "animation",
          "Directional/action poses require a complete hips/leg/shin/foot rig",
        );
      return;
    }
    this.object.updateWorldMatrix(true, false);
    const origin = this.object.getWorldPosition(new THREE.Vector3());
    const grounded = motion.grounded ?? true;
    const reset =
      interrupted ||
      this.previousGrounded !== grounded ||
      (this.previousOrigin && origin.distanceTo(this.previousOrigin) > 0.7);
    this.previousOrigin = origin;
    this.previousGrounded = grounded;
    const speed = this.gaitVelocity.length(),
      gait = Math.min(1, speed / 4),
      stanceFraction = 0.62 - 0.2 * gait;
    const inverse = this.object.matrixWorld.clone().invert(),
      up = new THREE.Vector3(0, 1, 0).transformDirection(
        this.object.matrixWorld,
      );
    for (const [hand, suffix, side] of [
      ["left", "L", -1],
      ["right", "R", 1],
    ] as const) {
      const thigh = view.sockets.get(`leg_${suffix}`)!,
        shin = view.sockets.get(`shin_${suffix}`)!,
        ankle = view.sockets.get(`foot_${suffix}`)!,
        foot = this.feet[hand];
      if (
        thigh.parent !== hips ||
        shin.parent !== thigh ||
        ankle.parent !== shin
      )
        throw new AvatarError(
          "animation",
          "Foot planting requires the declared leg hierarchy",
        );
      const base = hips.position
        .clone()
        .add(thigh.position)
        .add(shin.position)
        .add(ankle.position);
      base.x += side * this.poseValues.stance * 0.09;
      base.x +=
        (side * 0.06 * Math.abs(this.gaitVelocity.x)) / Math.max(0.001, speed);
      const phase = (this.phase + (hand === "right" ? 0.5 : 0)) % 1,
        contact = phase < stanceFraction;
      let lift = 0;
      if (!grounded || motion.reducedMotion || speed < 0.025) {
        const target = base.clone();
        if (!grounded) {
          target.y += 0.05 + this.poseValues.tuck * 0.24;
          target.z += this.poseValues.tuck * 0.08;
        }
        target.applyMatrix4(this.object.matrixWorld);
        if (!foot.initialized || reset || motion.reducedMotion || !grounded)
          foot.target.copy(target);
        else foot.target.lerp(target, 1 - Math.exp(-14 * dt));
        foot.contact = grounded;
        foot.start.copy(foot.target);
        foot.initialized = true;
      } else if (motion.velocity) {
        if (!foot.initialized || reset) {
          foot.target.copy(base).applyMatrix4(this.object.matrixWorld);
          foot.start.copy(foot.target);
          foot.contact = contact;
          foot.initialized = true;
        }
        if (contact && !foot.contact) {
          const landing = base.clone();
          landing.x += (this.gaitVelocity.x * stanceFraction) / (frequency * 2);
          landing.z += (this.gaitVelocity.y * stanceFraction) / (frequency * 2);
          foot.target.copy(landing).applyMatrix4(this.object.matrixWorld);
        }
        if (!contact) {
          if (foot.contact) foot.start.copy(foot.target);
          const progress = (phase - stanceFraction) / (1 - stanceFraction),
            remaining = ((1 - progress) * (1 - stanceFraction)) / frequency;
          const goal = base.clone();
          goal.x +=
            this.gaitVelocity.x *
            (remaining + stanceFraction / (frequency * 2));
          goal.z +=
            this.gaitVelocity.y *
            (remaining + stanceFraction / (frequency * 2));
          goal.applyMatrix4(this.object.matrixWorld);
          lift = Math.sin(Math.PI * progress) * (0.075 + 0.12 * gait);
          foot.target
            .copy(foot.start)
            .lerp(goal, THREE.MathUtils.smoothstep(progress, 0, 1))
            .addScaledVector(up, lift);
        }
        foot.contact = contact;
      } else {
        const progress = contact
          ? phase / stanceFraction
          : (phase - stanceFraction) / (1 - stanceFraction);
        const lead = (speed * stanceFraction) / (frequency * 2),
          along = contact
            ? lead * (1 - 2 * progress)
            : THREE.MathUtils.lerp(
                -lead,
                lead,
                THREE.MathUtils.smoothstep(progress, 0, 1),
              );
        const target = base
          .clone()
          .add(
            new THREE.Vector3(this.gaitVelocity.x, 0, this.gaitVelocity.y)
              .normalize()
              .multiplyScalar(along),
          );
        lift = contact
          ? 0
          : Math.sin(Math.PI * progress) * (0.075 + 0.12 * gait);
        target.y += lift;
        foot.target.copy(target).applyMatrix4(this.object.matrixWorld);
        foot.contact = contact;
        foot.initialized = true;
      }
      // Limit ground-plane reach before IK, preserving foot height and both bone lengths.
      const local = foot.target.clone().applyMatrix4(inverse),
        hip = hips.position.clone().add(thigh.position);
      hip.y += this.assembly!.root.position.y;
      const total = shin.position.length() + ankle.position.length() - 0.0001,
        dy = local.y - hip.y;
      const radius = Math.sqrt(Math.max(0.0001, total * total - dy * dy)),
        planar = new THREE.Vector2(local.x - hip.x, local.z - hip.z);
      if (planar.length() > radius) {
        planar.setLength(radius);
        local.x = hip.x + planar.x;
        local.z = hip.z + planar.y;
        foot.target.copy(local).applyMatrix4(this.object.matrixWorld);
        foot.contact = false;
      }
      foot.knee = poseLeg(
        hips,
        thigh,
        shin,
        ankle,
        foot.target,
        lift > 0 ? 0.25 * Math.min(1, lift / 0.12) : 0,
      );
      foot.phase = phase;
    }
  }
  animationDiagnostics() {
    return {
      velocity: this.gaitVelocity.toArray(),
      pose: { ...this.poseValues },
      feet: Object.fromEntries(
        Object.entries(this.feet).map(([hand, foot]) => [
          hand,
          {
            contact: foot.contact,
            position: foot.target.toArray(),
            kneeDegrees: foot.knee,
            phase: foot.phase,
          },
        ]),
      ),
    };
  }
  /** ZMap visual adapter: the caller still resolves approved recipes from app identity. */
  asCharacter(reducedMotion: () => boolean = () => false) {
    return {
      object: this.object,
      update: (
        body: { vx: number; vz: number; gesture: number; facing?: number },
        time: number,
      ) =>
        this.update(time, {
          reducedMotion: reducedMotion(),
          speed: Math.min(1, Math.hypot(body.vx, body.vz) / 4),
          ...(body.facing === undefined
            ? {}
            : {
                velocity: {
                  x:
                    body.vx * Math.cos(body.facing) -
                    body.vz * Math.sin(body.facing),
                  z:
                    body.vx * Math.sin(body.facing) +
                    body.vz * Math.cos(body.facing),
                },
              }),
          gesture: body.gesture > 0 ? "wave" : "idle",
        }),
    };
  }
  diagnostics() {
    let triangles = 0,
      sourceTriangles = 0,
      meshes = 0;
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes++;
        const count =
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        triangles += count;
        if (!o.userData.comicOutline) sourceTriangles += count;
      }
    });
    return {
      meshes,
      triangles,
      sourceTriangles,
      parts: this.current
        ? Object.values(this.current.parts).filter(Boolean).length + 1
        : 0,
    };
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    ++this.generation;
    this.handLayer?.dispose();
    this.handLayer = undefined;
    if (this.assembly) dispose(this.assembly.root);
    this.object.clear();
    this.assembly = undefined;
    this.current = undefined;
    this.poseView = undefined;
  }
}
