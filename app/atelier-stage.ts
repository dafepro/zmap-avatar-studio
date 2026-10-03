import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ComicStyle,
  type AvatarInstance,
  type AvatarLibrary,
  type Recipe,
  type Motion,
} from "../src";

export class AtelierStage {
  readonly scene = new THREE.Scene();
  readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  readonly camera = new THREE.OrthographicCamera(
    -1.4,
    1.4,
    1.25,
    -1.25,
    0.05,
    30,
  );
  readonly controls: OrbitControls;
  private comic = new ComicStyle({
    inkWidth: 1.8,
    shadowStrength: 0.78,
    pigment: 0.1,
    inkColor: "#282431",
  });
  private frame = 0;
  private observer: ResizeObserver;
  private pixels = new THREE.Vector2();
  private clock = 0;
  private lastMs = 0;
  pose: Motion["gesture"] = "idle";
  paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
  turning = false;
  constructor(
    readonly host: HTMLElement,
    readonly avatar: AvatarInstance,
  ) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Live 3D avatar. Drag to orbit, scroll to zoom. Keyboard view controls below.",
    );
    this.renderer.domElement.tabIndex = 0;
    host.append(this.renderer.domElement);
    this.scene.add(avatar.object);
    this.scene.add(new THREE.HemisphereLight("#fff4df", "#8381aa", 2));
    const sun = new THREE.DirectionalLight("#fff2d0", 3);
    sun.position.set(-3, 5, 4);
    this.scene.add(sun);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.73, 0.06, 64),
      new THREE.MeshBasicMaterial({ color: "#c1bdd1" }),
    );
    floor.position.y = -0.034;
    this.scene.add(floor);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.79, 0.797, 96),
      new THREE.MeshBasicMaterial({ color: "#7e778f", side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.058;
    this.scene.add(ring);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.54, 64),
      new THREE.MeshBasicMaterial({
        color: "#4d4368",
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.001;
    this.scene.add(shadow);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0.8;
    this.controls.maxPolarAngle = 1.65;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 2.2;
    this.view("hero");
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.frame = requestAnimationFrame(this.animate);
  }
  private resize() {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight),
      aspect = w / h;
    this.renderer.setSize(w, h);
    const half = aspect < 0.7 ? (1.25 / aspect) * 0.7 : 1.25;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.updateProjectionMatrix();
  }
  view(side: "hero" | "front" | "side" | "back" | "face") {
    const face = side === "face";
    this.controls.target.set(0, face ? 1.77 : 1.05, 0);
    const angles = {
      hero: 0.35,
      front: 0,
      side: Math.PI / 2,
      back: Math.PI,
      face: 0.08,
    };
    this.camera.position.set(
      Math.sin(angles[side]) * 4,
      face ? 1.79 : 1.34,
      Math.cos(angles[side]) * 4,
    );
    this.camera.zoom = face ? 2.8 : 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  private animate = (ms: number) => {
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, Math.max(0, (ms - this.lastMs) / 1000));
    this.lastMs = ms;
    if (document.hidden) return;
    if (!this.paused) this.clock += dt;
    this.avatar.update(this.clock, {
      gesture: this.pose,
      reducedMotion: this.paused,
    });
    this.controls.autoRotate = this.turning && !this.paused;
    this.controls.autoRotateSpeed = 1;
    this.controls.update();
    const root = this.avatar.object.children[0];
    if (root)
      this.comic.update(root, this.renderer.getDrawingBufferSize(this.pixels));
    this.renderer.render(this.scene, this.camera);
  };
  portrait() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.comic.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Thumbnail renders use the same validated parts, not substitute 2D illustrations. */
export class LookThumbnails {
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.05, 20);
  private comic = new ComicStyle({ inkWidth: 1.4, pigment: 0 });
  private avatar: AvatarInstance;
  private chain: Promise<void> = Promise.resolve();
  private cache = new Map<string, string>();
  private disposed = false;
  constructor(library: AvatarLibrary) {
    this.avatar = library.create();
    this.scene.add(this.avatar.object);
    this.renderer.setSize(180, 160);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  render(
    recipe: Recipe,
    slot: string,
    isCurrent: () => boolean = () => true,
  ): Promise<string | undefined> {
    const key = JSON.stringify([recipe, slot]);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const job = this.chain.then(async () => {
      if (this.disposed) throw new Error("Thumbnails closed");
      if (!isCurrent()) return undefined;
      await this.avatar.setAppearance(recipe);
      this.avatar.update(0, { reducedMotion: true });
      const head = [
          "head",
          "face",
          "hair",
          "eyewear",
          "headwear",
          "accessory",
        ].includes(slot),
        shoes = slot === "shoes",
        bottom = slot === "bottom";
      const target = head ? 1.77 : shoes ? 0.2 : bottom ? 0.71 : 1.3,
        half = head ? 0.33 : shoes ? 0.4 : bottom ? 0.46 : 0.55;
      this.camera.top = half;
      this.camera.bottom = -half;
      this.camera.left = -half * 1.125;
      this.camera.right = half * 1.125;
      this.camera.position.set(0.7, target + 0.08, 4);
      this.camera.lookAt(0, target, 0);
      this.camera.updateProjectionMatrix();
      this.comic.update(
        this.avatar.object.children[0],
        new THREE.Vector2(180, 160),
      );
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL();
      this.cache.set(key, url);
      if (this.cache.size > 80)
        this.cache.delete(this.cache.keys().next().value!);
      return url;
    });
    this.chain = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  dispose() {
    this.disposed = true;
    void this.chain.finally(() => {
      this.comic.dispose();
      this.avatar.dispose();
      this.renderer.dispose();
    });
  }
}
