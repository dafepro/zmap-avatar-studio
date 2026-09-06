import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ComicStyle,
  type AvatarInstance,
  type AvatarLibrary,
  type Recipe,
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
  private pixels = new THREE.Vector2();
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
    this.avatar.update(ms / 1000, {
      gesture: this.pose,
      reducedMotion: this.reduced,
    });
    if (this.comicEnabled)
      this.comic.update(
        this.avatar.object.children[0],
        this.renderer.getDrawingBufferSize(this.pixels),
      );
    this.renderer.render(this.scene, this.camera);
  };
  setComic(enabled: boolean) {
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
  }
  setPose(pose: Motion["gesture"]) {
    this.pose = pose;
  }
  setReduced(reduced: boolean) {
    this.reduced = reduced;
  }
  turn(value: boolean) {
    this.turning = value;
  }
  view(side: "front" | "side" | "back") {
    const distance = this.small ? 8 : 4.3;
    this.camera.position.set(
      side === "side" ? distance : 0,
      1.55,
      side === "back" ? -distance : side === "front" ? distance : 0,
    );
    this.controls.target.set(0, 0.96, 0);
    this.controls.update();
  }
  scale(value: boolean) {
    this.small = value;
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = value ? 0.55 : 1;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(0, 1.6, value ? 8 : 4.3);
    this.controls.update();
  }
  png() {
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
          const face = ["head", "face", "hair", "accessory"].includes(slot),
            foot = slot === "shoes";
          const y = face
            ? 1.61
            : foot
              ? 0.19
              : slot === "bottom"
                ? 0.66
                : slot === "shirt"
                  ? 1.1
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
