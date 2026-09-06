import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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
function dispose(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}
type Assembly = {
  root: THREE.Group;
  sockets: Map<string, THREE.Group>;
  effects: { object: THREE.Object3D; kind: string }[];
};
export class AvatarLibrary {
  readonly catalog: Catalog;
  private cache = new Map<string, Promise<THREE.Group>>();
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
  private load(asset: Asset): Promise<THREE.Group> {
    if (this.closed)
      return Promise.reject(
        new AvatarError("disposed", "Avatar library is disposed"),
      );
    const cached = this.cache.get(asset.id);
    if (cached) {
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
        const scene = (await new GLTFLoader().parseAsync(bytes.buffer, ""))
          .scene;
        if (this.closed) {
          dispose(scene);
          throw new AvatarError("disposed", "Avatar library is disposed");
        }
        return scene;
      } finally {
        clearTimeout(timeout);
        this.controllers.delete(controller);
      }
    })();
    this.cache.set(asset.id, work);
    void work.catch(() => {
      if (this.cache.get(asset.id) === work) this.cache.delete(asset.id);
    });
    // Templates never enter a live scene. Instances own their geometry and materials.
    if (this.cache.size > 32) {
      const [key, old] = this.cache.entries().next().value!;
      this.cache.delete(key);
      void old.then(dispose, () => {});
    }
    return work;
  }
  async assemble(recipe: Recipe): Promise<Assembly> {
    validateRecipe(recipe, this.catalog);
    const assets = selectedAssets(recipe, this.catalog);
    const loaded = await Promise.allSettled(assets.map((a) => this.load(a)));
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
  }
  private assembleModels(
    recipe: Recipe,
    assets: Asset[],
    models: THREE.Group[],
  ): Assembly {
    const root = new THREE.Group();
    root.name = "Avatar";
    const sockets = new Map<string, THREE.Group>();
    for (const s of this.catalog.rig.sockets) {
      const node = new THREE.Group();
      node.name = s.id;
      node.position.fromArray(s.position);
      (s.parent ? sockets.get(s.parent)! : root).add(node);
      sockets.set(s.id, node);
    }
    const effects: Assembly["effects"] = [];
    try {
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i],
          model = models[i];
        const geometries = new Map<
            THREE.BufferGeometry,
            THREE.BufferGeometry
          >(),
          materials = new Map<THREE.Material, THREE.Material>();
        for (const mount of asset.attachments) {
          const source = model.getObjectByName(mount.node);
          if (!source)
            throw new AvatarError("attachment", `Missing ${mount.node}`);
          const object = source.clone(true);
          object.name = `part:${asset.id}:${mount.socket}`;
          object.userData.assetId = asset.id;
          object.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              if (!geometries.has(o.geometry))
                geometries.set(o.geometry, o.geometry.clone());
              o.geometry = geometries.get(o.geometry)!;
              const copy = (m: THREE.Material) => {
                if (!materials.has(m)) {
                  const cloned = m.clone();
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
            }
          });
          sockets.get(mount.socket)!.add(object);
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
    const loaded = await Promise.allSettled(assets.map((a) => this.load(a)));
    const failure = loaded.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failure) throw failure.reason;
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
      pendingRequests: this.controllers.size,
    };
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.controllers) c.abort();
    for (const value of this.cache.values()) void value.then(dispose, () => {});
    this.cache.clear();
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
      meshes = 0;
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes++;
        triangles +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      }
    });
    return {
      meshes,
      triangles,
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
