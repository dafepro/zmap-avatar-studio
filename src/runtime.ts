import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
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
export type Motion = {
  speed?: number;
  gesture?: "idle" | "walk" | "wave" | "run";
  reducedMotion?: boolean;
};
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
function dispose(root: THREE.Object3D) {
  if (disposedRoots.has(root)) return;
  disposedRoots.add(root);
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>(templateTextures.get(root)),
    skeletons = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
      if (o instanceof THREE.SkinnedMesh) skeletons.add(o.skeleton);
    }
  });
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
type Assembly = {
  root: THREE.Group;
  sockets: Map<string, THREE.Bone>;
  effects: { object: THREE.Object3D; kind: string }[];
};
export class AvatarLibrary {
  readonly catalog: Catalog;
  private cache = new Map<string, Promise<THREE.Group>>();
  // A synchronous prepared factory cannot refetch an evicted image. Keep its
  // template lease until library disposal; one entry per approved catalog asset.
  private preparedTemplates = new Map<string, Promise<THREE.Group>>();
  private assemblyLeases = new Map<Promise<THREE.Group>, number>();
  private retiredTemplates = new Set<Promise<THREE.Group>>();
  private controllers = new Set<AbortController>();
  private closed = false;
  constructor(
    catalog: unknown,
    readonly baseUrl: string,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    validateCatalog(catalog);
    this.catalog = structuredClone(catalog);
  }
  private load(asset: Asset, prepare = false): Promise<THREE.Group> {
    if (this.closed)
      return Promise.reject(
        new AvatarError("disposed", "Avatar library is disposed"),
      );
    const pinned = this.preparedTemplates.get(asset.id);
    if (pinned) return pinned;
    const cached = this.cache.get(asset.id);
    if (cached) {
      if (prepare) this.preparedTemplates.set(asset.id, cached);
      this.cache.delete(asset.id);
      this.cache.set(asset.id, cached);
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
    this.cache.set(asset.id, work);
    if (prepare) this.preparedTemplates.set(asset.id, work);
    void work.catch(() => {
      if (this.cache.get(asset.id) === work) this.cache.delete(asset.id);
      if (this.preparedTemplates.get(asset.id) === work)
        this.preparedTemplates.delete(asset.id);
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
export class AvatarInstance {
  readonly object = new THREE.Group();
  private assembly?: Assembly;
  private current?: Recipe;
  private generation = 0;
  private closed = false;
  private phase = 0;
  private lastTime?: number;
  constructor(
    private library: AvatarLibrary,
    initial?: { assembly: Assembly; recipe: Recipe },
  ) {
    this.object.name = "ModularAvatar";
    if (initial) {
      this.assembly = initial.assembly;
      this.current = structuredClone(initial.recipe);
      this.object.add(initial.assembly.root);
    }
  }
  get recipe() {
    return this.current ? structuredClone(this.current) : undefined;
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
    if (this.assembly) {
      this.object.remove(this.assembly.root);
      dispose(this.assembly.root);
    }
    this.assembly = next;
    this.current = requested;
    this.object.add(next.root);
    return true;
  }
  update(time: number, motion: Motion = {}) {
    if (!this.assembly || this.closed || !Number.isFinite(time)) return;
    const dt =
      this.lastTime === undefined
        ? 0
        : Math.max(0, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;
    const { sockets, effects } = this.assembly;
    for (const s of sockets.values()) s.rotation.set(0, 0, 0);
    const speed = motion.reducedMotion
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            motion.speed ??
              (motion.gesture === "walk"
                ? 0.65
                : motion.gesture === "run"
                  ? 1
                  : 0),
          ),
        );
    this.phase += dt * (motion.gesture === "run" ? 12 : 8) * speed;
    const swing = Math.sin(this.phase) * 0.55 * speed;
    const rotate = (name: string, x: number, z = 0) => {
      const n = sockets.get(name);
      if (n) n.rotation.set(x, 0, z);
    };
    rotate("leg_L", swing);
    rotate("leg_R", -swing);
    rotate("shin_L", Math.max(0, -swing) * 0.7);
    rotate("shin_R", Math.max(0, swing) * 0.7);
    rotate("arm_L", -swing * 0.6, -0.14);
    rotate("arm_R", swing * 0.6, 0.14);
    rotate("forearm_L", -0.1 - Math.abs(swing) * 0.25);
    rotate("forearm_R", -0.1 - Math.abs(swing) * 0.25);
    if (motion.gesture === "wave") {
      rotate("arm_R", -2.7, 0.55);
      rotate(
        "forearm_R",
        motion.reducedMotion ? -0.2 : -0.2 + Math.sin(time * 7) * 0.16,
      );
    }
    rotate("head", 0, motion.reducedMotion ? 0 : Math.sin(time * 1.5) * 0.016);
    for (const e of effects) {
      e.object.rotation.y = motion.reducedMotion
        ? 0
        : time * (e.kind === "orbit" ? 0.5 : 0.25);
    }
  }
  /** ZMap visual adapter: the caller still resolves approved recipes from app identity. */
  asCharacter(reducedMotion: () => boolean = () => false) {
    return {
      object: this.object,
      update: (
        body: { vx: number; vz: number; gesture: number },
        time: number,
      ) =>
        this.update(time, {
          reducedMotion: reducedMotion(),
          speed: Math.min(1, Math.hypot(body.vx, body.vz) / 4),
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
    if (this.assembly) dispose(this.assembly.root);
    this.object.clear();
    this.assembly = undefined;
    this.current = undefined;
  }
}
