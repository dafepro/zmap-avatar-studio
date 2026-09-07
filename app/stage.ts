import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ComicStyle,
  bakeDirectionalAtlas,
  type DirectionalAtlas,
  type DirectionalPreview,
  type AvatarInstance,
  type AvatarLibrary,
  type Recipe,
  type Catalog,
  type Motion,
} from "../src";
export class Stage {
  readonly scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera =
    new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  readonly controls: OrbitControls;
  private resize: ResizeObserver;
  private frame = 0;
  private pose: Motion["gesture"] = "idle";
  private turning = false;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private small = false;
  private comic = new ComicStyle();
  private comicEnabled = false;
  private capture?: AbortController;
  private atlas?: DirectionalAtlas;
  private projection?: DirectionalPreview;
  private projected = false;
  private captureGeneration = 0;
  private capturedRoot?: THREE.Object3D;
  private livePolar: [number, number] = [0.35, Math.PI * 0.56];
  private livePitch = Math.PI / 2;
  private lastUpdateSeconds = 0;
  private captureInfo?: {
    renderStyle: "illustrated" | "studio";
    pose: {
      gesture: Motion["gesture"];
      timeSeconds: number;
      reducedMotion: boolean;
    };
  };
  onProjectionInvalidated = () => {};
  private pixels = new THREE.Vector2();
  private inspection: "avatar" | "base" | "hair" | "outfit" = "avatar";
  private inspectionCatalog?: Catalog;
  private inspectionRoot?: THREE.Object3D;
  inspect(view: "avatar" | "base" | "hair" | "outfit", catalog: Catalog) {
    this.invalidateProjection();
    this.inspection = view;
    this.inspectionCatalog = catalog;
    this.inspectionRoot = undefined;
    const target = 1.07;
    this.controls.target.set(0, target, 0);
    this.camera.position.set(0.5, target + 0.12, 4.5);
    this.controls.minDistance = 2.7;
    this.controls.maxDistance = 9;
    if (this.camera instanceof THREE.OrthographicCamera) {
      const half = 1.2;
      const aspect =
        Math.max(1, this.container.clientWidth) /
        Math.max(1, this.container.clientHeight);
      this.camera.top = half;
      this.camera.bottom = -half;
      this.camera.left = -half * aspect;
      this.camera.right = half * aspect;
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    this.applyInspection();
  }
  private applyInspection() {
    const root = this.avatar.object.children[0],
      catalog = this.inspectionCatalog;
    if (!root || !catalog || root === this.inspectionRoot) return;
    const slots =
      this.inspection === "base"
        ? ["body", "head", "face"]
        : this.inspection === "hair"
          ? ["head", "face", "hair"]
          : this.inspection === "outfit"
            ? ["shirt", "bottom", "shoes"]
            : null;
    const selected = new Set(Object.values(this.avatar.recipe?.parts ?? {}));
    const covered = new Set(
      catalog.assets
        .filter((a) => selected.has(a.id) && (!slots || slots.includes(a.slot)))
        .flatMap((a) => a.covers ?? []),
    );
    root.traverse((object) => {
      const id = object.userData.assetId;
      if (id)
        object.visible =
          !slots ||
          slots.includes(catalog.assets.find((a) => a.id === id)?.slot ?? "");
      if (object instanceof THREE.Mesh && object.userData.avatarRegion)
        object.visible = !covered.has(object.userData.avatarRegion);
    });
    this.inspectionRoot = root;
    this.fitInspection();
  }
  /** Fit on inspection events, not every animation frame. A sphere keeps every
   * orbit angle inside the smaller viewport dimension, including portrait. */
  private fitInspection() {
    if (!this.inspectionCatalog || this.projected || this.capture) return;
    const root = this.avatar.object.children[0];
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3(),
      point = new THREE.Vector3();
    root.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
      const positions = object.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld);
        bounds.expandByPoint(point);
      }
    });
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere()),
      radius = sphere.radius * 1.12 + 0.004,
      aspect =
        Math.max(1, this.container.clientWidth) /
        Math.max(1, this.container.clientHeight),
      direction = this.camera.position.clone().sub(this.controls.target);
    let distance = Math.max(direction.length(), radius * 2);
    if (!direction.lengthSq()) direction.set(0, 0.03, 1);
    direction.normalize();
    this.camera.zoom = this.small ? 0.55 : 1;
    if (this.camera instanceof THREE.OrthographicCamera) {
      const half = radius / Math.min(1, aspect);
      this.camera.top = half;
      this.camera.bottom = -half;
      this.camera.left = -half * aspect;
      this.camera.right = half * aspect;
    } else {
      this.camera.aspect = aspect;
      this.camera.zoom = 1;
      const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2),
        horizontal = Math.atan(Math.tan(vertical) * aspect);
      distance = radius / Math.sin(Math.min(vertical, horizontal));
      if (this.small) distance /= 0.55;
    }
    this.controls.minDistance = Math.max(0.1, radius + this.camera.near);
    this.controls.maxDistance = Math.max(9, distance * 2);
    this.controls.target.copy(sphere.center);
    this.camera.position
      .copy(sphere.center)
      .addScaledVector(direction, distance);
    this.camera.far = Math.max(50, distance + radius * 2);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  constructor(
    readonly container: HTMLElement,
    readonly avatar: AvatarInstance,
  ) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D avatar preview. Drag to orbit and scroll to zoom. Use the view buttons for keyboard control.",
    );
    this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight("#fff9e9", "#626975", 2.4));
    const key = new THREE.DirectionalLight("#fff2d9", 3);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#cadcde", 1.5);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.63, 64),
      new THREE.MeshBasicMaterial({
        color: "#4b5142",
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.002;
    this.scene.add(ground);
    this.scene.add(avatar.object);
    this.camera.position.set(1.7, 1.65, 4.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.96, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 2.7;
    this.controls.maxDistance = 9;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI * 0.56;
    this.controls.update();
    this.resize = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth),
        h = Math.max(1, container.clientHeight);
      this.renderer.setSize(w, h);
      if (this.camera instanceof THREE.PerspectiveCamera)
        this.camera.aspect = w / h;
      else {
        const half = this.camera.top;
        this.camera.left = (-half * w) / h;
        this.camera.right = (half * w) / h;
      }
      this.camera.updateProjectionMatrix();
      this.fitInspection();
    });
    this.resize.observe(container);
    this.animate(0);
  }
  private animate = (ms: number) => {
    this.frame = requestAnimationFrame(this.animate);
    if (document.hidden) return;
    this.controls.autoRotate = this.turning && !this.reduced;
    this.controls.autoRotateSpeed = 1;
    this.controls.update();
    if (
      (this.projected || this.capture) &&
      this.capturedRoot !== this.avatar.object.children[0]
    ) {
      this.leaveProjection();
      this.onProjectionInvalidated();
    }
    if (!this.projected) {
      this.applyInspection();
      this.lastUpdateSeconds = ms / 1000;
      this.avatar.update(this.lastUpdateSeconds, {
        gesture: this.pose,
        reducedMotion: this.reduced,
      });
    }
    if (this.comicEnabled)
      this.comic.update(
        this.avatar.object.children[0],
        this.renderer.getDrawingBufferSize(this.pixels),
      );
    this.updateProjectionView();
    this.renderer.render(this.scene, this.camera);
  };
  setComic(enabled: boolean) {
    this.invalidateProjection();
    if (enabled === this.comicEnabled) return;
    const old = this.camera,
      aspect =
        Math.max(1, this.container.clientWidth) /
        Math.max(1, this.container.clientHeight);
    const half =
      old instanceof THREE.PerspectiveCamera
        ? Math.tan(THREE.MathUtils.degToRad(old.fov / 2)) *
          old.position.distanceTo(this.controls.target)
        : old.top / old.zoom;
    const camera = enabled
      ? new THREE.OrthographicCamera(
          -half * aspect,
          half * aspect,
          half,
          -half,
          0.05,
          50,
        )
      : new THREE.PerspectiveCamera(30, aspect, 0.05, 50);
    camera.position.copy(old.position);
    camera.quaternion.copy(old.quaternion);
    if (!enabled)
      camera.position
        .sub(this.controls.target)
        .setLength(half / Math.tan(THREE.MathUtils.degToRad(15)))
        .add(this.controls.target);
    this.camera = camera;
    this.controls.object = camera;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 2.5;
    this.controls.update();
    this.comicEnabled = enabled;
    if (!enabled) this.comic.clear();
    let i = 0;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Light) {
        o.intensity = (enabled ? [0.85, 2, 0.4] : [2.4, 3, 1.5])[i++] ?? 1;
      }
    });
    this.fitInspection();
  }
  setPose(pose: Motion["gesture"]) {
    this.invalidateProjection();
    this.pose = pose;
  }
  setReduced(reduced: boolean) {
    this.invalidateProjection();
    this.reduced = reduced;
  }
  turn(value: boolean) {
    this.turning = value;
  }
  view(side: "front" | "side" | "back") {
    const distance =
      this.inspectionCatalog && !this.projected
        ? this.camera.position.distanceTo(this.controls.target)
        : this.small
          ? 8
          : 4.3;
    this.camera.position
      .copy(this.controls.target)
      .add(
        new THREE.Vector3(
          side === "side" ? 1 : 0,
          0.137,
          side === "back" ? -1 : side === "front" ? 1 : 0,
        )
          .normalize()
          .multiplyScalar(distance),
      );
    this.controls.update();
    this.updateProjectionView();
  }
  scale(value: boolean) {
    this.small = value;
    if (this.inspectionCatalog && !this.projected && !this.capture) {
      this.fitInspection();
      return;
    }
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = value ? 0.55 : 1;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(0, 1.6, value ? 8 : 4.3);
    this.controls.update();
    this.updateProjectionView();
  }
  private updateProjectionView() {
    if (!this.projected || !this.projection) return;
    const delta = this.camera.position.clone().sub(this.controls.target);
    this.projection.setAzimuth(
      Math.atan2(delta.x, delta.z),
      THREE.MathUtils.degToRad(2),
    );
    this.projection.faceCamera(this.camera);
  }
  private invalidateProjection() {
    if (this.capture || this.projected || this.atlas) {
      this.leaveProjection();
      this.onProjectionInvalidated();
    }
  }
  leaveProjection() {
    const wasProjected = this.projected;
    this.capture?.abort();
    this.capture = undefined;
    ++this.captureGeneration;
    this.projected = false;
    this.avatar.object.visible = true;
    if (this.projection) {
      this.scene.remove(this.projection.object);
      this.projection.dispose();
      this.projection = undefined;
    }
    this.atlas?.dispose();
    this.atlas = undefined;
    this.capturedRoot = undefined;
    this.captureInfo = undefined;
    this.controls.minPolarAngle = this.livePolar[0];
    this.controls.maxPolarAngle = this.livePolar[1];
    if (wasProjected) {
      const delta = this.camera.position.clone().sub(this.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(delta);
      spherical.phi = this.livePitch;
      this.camera.position
        .setFromSpherical(spherical)
        .add(this.controls.target);
      this.controls.update();
    }
  }
  async project(onProgress: (done: number, total: number) => void) {
    this.leaveProjection();
    const root = this.avatar.object.children[0];
    if (!root) throw Error("Choose a complete avatar before capturing");
    const generation = ++this.captureGeneration,
      controller = new AbortController();
    this.capture = controller;
    this.capturedRoot = root;
    this.livePolar = [this.controls.minPolarAngle, this.controls.maxPolarAngle];
    this.livePitch = this.controls.getPolarAngle();
    this.captureInfo = {
      renderStyle: this.comicEnabled ? "illustrated" : "studio",
      pose: {
        gesture: this.pose,
        timeSeconds: this.lastUpdateSeconds,
        reducedMotion: this.reduced,
      },
    };
    const delta = this.camera.position.clone().sub(this.controls.target),
      azimuth = Math.atan2(delta.x, delta.z),
      elevation = 0.13;
    let atlas: DirectionalAtlas;
    try {
      if (this.comicEnabled)
        this.comic.update(
          root,
          this.renderer.getDrawingBufferSize(this.pixels),
        );
      atlas = await bakeDirectionalAtlas(this.renderer, this.avatar.object, {
        tileSize: 512,
        elevation,
        signal: controller.signal,
        lights: this.scene.children.filter(
          (o): o is THREE.Light => o instanceof THREE.Light,
        ),
        onProgress,
      });
    } catch (error) {
      if (this.capture === controller) {
        this.capturedRoot = undefined;
        this.captureInfo = undefined;
      }
      throw error;
    } finally {
      if (this.capture === controller) this.capture = undefined;
    }
    if (
      generation !== this.captureGeneration ||
      root !== this.avatar.object.children[0]
    ) {
      atlas.dispose();
      throw new DOMException(
        "The avatar changed while capturing",
        "AbortError",
      );
    }
    this.atlas = atlas;
    this.projection = atlas.createPreview();
    this.projection.setAzimuth(azimuth);
    this.scene.add(this.projection.object);
    this.avatar.object.visible = false;
    this.projected = true;
    this.capturedRoot = root;
    this.controls.minPolarAngle = this.controls.maxPolarAngle =
      Math.PI / 2 - elevation;
    this.controls.update();
    this.updateProjectionView();
    return atlas.metadata;
  }
  projectionPng() {
    this.projectionMetadata();
    const atlas = this.atlas!;
    const { width, height } = atlas.metadata,
      source = atlas.readPixels(),
      pixels = new Uint8ClampedArray(source.length),
      stride = width * 4;
    for (let y = 0; y < height; y++)
      pixels.set(
        source.subarray(y * stride, (y + 1) * stride),
        (height - 1 - y) * stride,
      );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas
      .getContext("2d")!
      .putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  }
  projectionMetadata() {
    if (!this.atlas || this.capturedRoot !== this.avatar.object.children[0])
      throw Error("Capture the current look first");
    return { ...this.atlas.metadata, ...structuredClone(this.captureInfo) };
  }
  png() {
    this.updateProjectionView();
    const alpha = this.renderer.getClearAlpha();
    this.renderer.setClearAlpha(0);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.renderer.setClearAlpha(alpha);
    return url;
  }
  diagnostics() {
    return {
      ...this.avatar.diagnostics(),
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      drawCalls: this.renderer.info.render.calls,
    };
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.leaveProjection();
    this.resize.disconnect();
    this.controls.dispose();
    this.comic.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          m.dispose();
      }
    });
    this.avatar.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
/** One reusable offscreen renderer; no context per catalog card. */
export class Thumbnails {
  private renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  private tail = Promise.resolve();
  private closed = false;
  constructor(private library: AvatarLibrary) {
    this.renderer.setSize(240, 240);
    this.renderer.setClearColor("#e9e7dc", 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.add(new THREE.HemisphereLight("#fff9e9", "#687177", 2.4));
    const key = new THREE.DirectionalLight("#fff2dc", 3);
    key.position.set(3, 5, 4);
    this.scene.add(key);
  }
  render(recipe: Recipe, slot: string): Promise<string> {
    let resolve!: (url: string) => void, reject!: (error: unknown) => void;
    const result = new Promise<string>((r, j) => {
      resolve = r;
      reject = j;
    });
    this.tail = this.tail
      .then(async () => {
        if (this.closed) throw Error("Thumbnails disposed");
        const avatar = this.library.create();
        try {
          await avatar.setAppearance(recipe);
          if (this.closed) throw Error("Thumbnails disposed");
          this.scene.add(avatar.object);
          avatar.update(0, { reducedMotion: true });
          const face = [
              "head",
              "face",
              "hair",
              "accessory",
              "headwear",
              "eyewear",
              "facialHair",
            ].includes(slot),
            foot = slot === "shoes";
          const y = face
            ? 1.81
            : foot
              ? 0.19
              : slot === "bottom"
                ? 0.91
                : slot === "shirt"
                  ? 1.28
                  : 1;
          const distance = face
            ? 1.48
            : foot
              ? 1.14
              : slot === "shirt"
                ? 1.85
                : slot === "bottom"
                  ? 1.75
                  : 4.8;
          this.camera.position.set(
            distance * 0.17,
            y + distance * 0.16,
            distance,
          );
          this.camera.lookAt(0, y, 0);
          this.renderer.render(this.scene, this.camera);
          resolve(this.renderer.domElement.toDataURL());
        } finally {
          this.scene.remove(avatar.object);
          avatar.dispose();
        }
      })
      .catch(reject);
    return result;
  }
  dispose() {
    this.closed = true;
    void this.tail.finally(() => {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    });
  }
}
