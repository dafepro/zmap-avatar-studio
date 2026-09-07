import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { OutputShader } from "three/addons/shaders/OutputShader.js";

export const DIRECTION_COUNT = 16;
const GRID = 4;
const TAU = Math.PI * 2;
const busy = new WeakSet<THREE.WebGLRenderer>();

export interface DirectionalFrame {
  index: number;
  /** Camera azimuth in radians: zero is +Z, increasing toward +X. */
  azimuth: number;
  /** Pixel rectangle in the exported image, measured from its top left. */
  rect: { x: number; y: number; width: number; height: number };
  /** Sampling bounds in the bottom-left origin texture coordinate system. */
  uv: [number, number, number, number];
}

export interface DirectionalMetadata {
  version: 1;
  projection: "orthographic-16";
  width: number;
  height: number;
  tileSize: number;
  columns: 4;
  rows: 4;
  elevation: number;
  center: [number, number, number];
  /** The square plane's width and height in the source avatar's world units. */
  worldSize: number;
  colorSpace: "srgb";
  pixelOrder: "bottom-up-rgba8";
  /** One RGBA texture plus an equally sized CPU export buffer, without mipmaps. */
  textureBytes: number;
  frames: DirectionalFrame[];
}

export interface DirectionalOptions {
  /** 64–512 pixels per view; default 256 gives a 1024² atlas. */
  tileSize?: number;
  /** Fixed pitch above the horizontal, in radians; default 7.5 degrees. */
  elevation?: number;
  /** Fractional empty space around the widest posed silhouette; default 0.08. */
  padding?: number;
  /** Lights are copied at their current world transforms. Otherwise a soft studio rig is used. */
  lights?: readonly THREE.Light[];
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  /** Optional scheduler for background tooling; defaults to yielding after each rendered direction. */
  yieldBetweenFrames?: () => Promise<void>;
}

/** Nearest 22.5-degree view. Exact half-sector ties select the increasing direction. */
export function directionIndex(azimuth: number): number {
  if (!Number.isFinite(azimuth)) throw Error("Azimuth must be finite");
  const wrapped = ((azimuth % TAU) + TAU) % TAU;
  return Math.floor(wrapped / (TAU / DIRECTION_COUNT) + 0.5) % DIRECTION_COUNT;
}

/** Keep the current view near a sector boundary to avoid flicker from a noisy camera. */
export function stableDirectionIndex(
  azimuth: number,
  previous: number,
  hysteresis = THREE.MathUtils.degToRad(2),
): number {
  requireFrame(previous);
  if (
    !Number.isFinite(hysteresis) ||
    hysteresis < 0 ||
    hysteresis >= Math.PI / 16
  )
    throw Error("Direction hysteresis must be between 0 and half a sector");
  const nearest = directionIndex(azimuth);
  const previousAngle = (previous * TAU) / DIRECTION_COUNT;
  const distance = Math.abs(
    Math.atan2(
      Math.sin(azimuth - previousAngle),
      Math.cos(azimuth - previousAngle),
    ),
  );
  return distance <= Math.PI / 16 + hysteresis ? previous : nearest;
}

/** Deterministic layout shared by the GPU preview and an exported PNG/JSON pair. */
export function directionalFrames(tileSize: number): DirectionalFrame[] {
  requireTileSize(tileSize);
  return Array.from({ length: DIRECTION_COUNT }, (_, index) => {
    const column = index % GRID;
    const row = Math.floor(index / GRID);
    // Half-pixel inset prevents neighboring directions from bleeding under bilinear filtering.
    const inset = 0.5 / (tileSize * GRID);
    return {
      index,
      azimuth: (index * TAU) / DIRECTION_COUNT,
      rect: {
        x: column * tileSize,
        y: row * tileSize,
        width: tileSize,
        height: tileSize,
      },
      uv: [
        column / GRID + inset,
        (GRID - 1 - row) / GRID + inset,
        (column + 1) / GRID - inset,
        (GRID - row) / GRID - inset,
      ],
    };
  });
}

function requireTileSize(size: number) {
  if (!Number.isInteger(size) || size < 64 || size > 512)
    throw Error("Directional tile size must be an integer from 64 to 512");
}
function requireFrame(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= DIRECTION_COUNT)
    throw Error("Direction frame must be an integer from 0 to 15");
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Directional bake cancelled", "AbortError");
}

/** One unlit, two-triangle preview. It shares its atlas's only texture. */
export class DirectionalPreview {
  readonly object: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private frame = 0;
  private closed = false;
  constructor(
    private readonly atlas: DirectionalAtlas,
    private readonly released: () => void,
  ) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        atlas: { value: atlas.texture },
        frameBounds: {
          value: new THREE.Vector4(...atlas.metadata.frames[0].uv),
        },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform sampler2D atlas;uniform vec4 frameBounds;varying vec2 vUv;void main(){gl_FragColor=texture2D(atlas,mix(frameBounds.xy,frameBounds.zw,vUv));if(gl_FragColor.a<0.0039)discard;\n#include <colorspace_fragment>\n}`,
    });
    this.object = new THREE.Mesh(
      new THREE.PlaneGeometry(
        atlas.metadata.worldSize,
        atlas.metadata.worldSize,
      ),
      material,
    );
    this.object.name = "16-view avatar projection";
    this.object.position.fromArray(atlas.metadata.center);
  }
  get frameIndex() {
    return this.frame;
  }
  setFrame(index: number): number {
    if (this.closed) throw Error("Directional preview is disposed");
    requireFrame(index);
    this.frame = index;
    this.object.material.uniforms.frameBounds.value.fromArray(
      this.atlas.metadata.frames[index].uv,
    );
    return index;
  }
  setAzimuth(azimuth: number, hysteresis = 0): number {
    return this.setFrame(
      hysteresis
        ? stableDirectionIndex(azimuth, this.frame, hysteresis)
        : directionIndex(azimuth),
    );
  }
  /** A consuming world calls this after choosing the view relative to the avatar's facing. */
  faceCamera(camera: THREE.Camera) {
    if (this.closed) throw Error("Directional preview is disposed");
    camera.getWorldQuaternion(this.object.quaternion);
    if (this.object.parent) {
      const parentRotation = this.object.parent
        .getWorldQuaternion(new THREE.Quaternion())
        .invert();
      this.object.quaternion.premultiply(parentRotation);
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
    this.released();
  }
}

/** A completed immutable capture. Partial captures are never returned. */
export class DirectionalAtlas {
  readonly texture: THREE.DataTexture;
  private previews = new Set<DirectionalPreview>();
  private closed = false;
  constructor(
    readonly metadata: DirectionalMetadata,
    private pixels: Uint8Array,
  ) {
    requireTileSize(metadata.tileSize);
    if (
      metadata.version !== 1 ||
      metadata.projection !== "orthographic-16" ||
      metadata.columns !== GRID ||
      metadata.rows !== GRID ||
      metadata.width !== metadata.tileSize * GRID ||
      metadata.height !== metadata.width ||
      metadata.colorSpace !== "srgb" ||
      metadata.pixelOrder !== "bottom-up-rgba8" ||
      metadata.textureBytes !== metadata.width * metadata.height * 4
    )
      throw Error("Invalid directional atlas metadata");
    if (
      !Number.isFinite(metadata.worldSize) ||
      metadata.worldSize <= 0 ||
      metadata.worldSize > 200 ||
      metadata.center.length !== 3 ||
      !metadata.center.every(Number.isFinite) ||
      !Number.isFinite(metadata.elevation) ||
      metadata.elevation < 0 ||
      metadata.elevation > Math.PI / 4
    )
      throw Error("Invalid directional atlas projection bounds");
    if (
      JSON.stringify(metadata.frames) !==
      JSON.stringify(directionalFrames(metadata.tileSize))
    )
      throw Error("Invalid directional atlas frame layout");
    if (pixels.length !== metadata.width * metadata.height * 4)
      throw Error("Directional atlas pixel dimensions do not match metadata");
    this.metadata = structuredClone(metadata);
    for (const frame of this.metadata.frames) {
      Object.freeze(frame.rect);
      Object.freeze(frame.uv);
      Object.freeze(frame);
    }
    Object.freeze(this.metadata.frames);
    Object.freeze(this.metadata.center);
    Object.freeze(this.metadata);
    this.texture = new THREE.DataTexture(
      pixels,
      metadata.width,
      metadata.height,
      THREE.RGBAFormat,
    );
    this.texture.name = "16-view avatar atlas";
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }
  createPreview(): DirectionalPreview {
    this.requireOpen();
    let preview: DirectionalPreview;
    preview = new DirectionalPreview(this, () => this.previews.delete(preview));
    this.previews.add(preview);
    return preview;
  }
  /** A detached RGBA8 copy, rows bottom-up. Flip rows before putting into ImageData for PNG export. */
  readPixels(_renderer?: THREE.WebGLRenderer): Uint8Array {
    this.requireOpen();
    return this.pixels.slice();
  }
  private requireOpen() {
    if (this.closed) throw Error("Directional atlas is disposed");
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const preview of this.previews) preview.dispose();
    this.texture.dispose();
    this.pixels = new Uint8Array(0);
    this.texture.image = { data: this.pixels, width: 0, height: 0 };
  }
}

interface Snapshot {
  object: THREE.Object3D;
  uploadTextures(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

const toneFunctions: Record<number, string> = {
  [THREE.LinearToneMapping]: "LinearToneMapping",
  [THREE.ReinhardToneMapping]: "ReinhardToneMapping",
  [THREE.CineonToneMapping]: "CineonToneMapping",
  [THREE.ACESFilmicToneMapping]: "ACESFilmicToneMapping",
  [THREE.AgXToneMapping]: "AgXToneMapping",
  [THREE.NeutralToneMapping]: "NeutralToneMapping",
};

function snapshotAvatar(
  source: THREE.Object3D,
  tileSize: number,
  toneMapping: THREE.ToneMapping,
  exposure: number,
): Snapshot {
  // SkeletonUtils reconnects copied bones to copied skinned meshes. All resources below are then owned by this transaction.
  const object = cloneSkeleton(source);
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  let geometryBytes = 0,
    texturePixels = 0,
    meshCount = 0;
  const dispose = () => {
    for (const geometry of geometries.values()) geometry.dispose();
    for (const material of materials.values()) material.dispose();
    for (const texture of textures.values()) texture.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
  };
  const copyTexture = (texture: THREE.Texture) => {
    if (!textures.has(texture)) {
      if ((texture as THREE.VideoTexture).isVideoTexture)
        throw Error("Directional capture requires a still texture");
      const image = texture.source.data;
      if (
        !image ||
        !(image.width > 0 && image.height > 0) ||
        image.complete === false
      )
        throw Error("Directional capture texture is not ready");
      texturePixels += image.width * image.height;
      if (texturePixels > 4 * 1024 * 1024)
        throw Error(
          "Directional capture source textures exceed 4 million pixels",
        );
      const copy = texture.clone();
      copy.source = new THREE.Source(image);
      copy.needsUpdate = true;
      textures.set(texture, copy);
    }
    return textures.get(texture)!;
  };
  const copyMaterial = (material: THREE.Material) => {
    if (!materials.has(material)) {
      const copy = material.clone();
      copy.onBeforeCompile = (shader, renderer) => {
        material.onBeforeCompile.call(copy, shader, renderer);
        // Three disables tone mapping and output encoding for ordinary render targets.
        // Capture each material's actual screen path instead of applying one mapper to the mixed result.
        if (
          copy.toneMapped &&
          toneFunctions[toneMapping] &&
          !(copy instanceof THREE.RawShaderMaterial)
        ) {
          shader.uniforms.zmapCaptureExposure = { value: exposure };
          shader.fragmentShader = shader.fragmentShader.replaceAll(
            "#include <tonemapping_pars_fragment>",
            "",
          );
          shader.fragmentShader = `precision highp float;\n#define TONE_MAPPING\n${THREE.ShaderChunk.tonemapping_pars_fragment.replaceAll("toneMappingExposure", "zmapCaptureExposure")}\nvec3 toneMapping(vec3 color){return ${toneFunctions[toneMapping]}(color);}\n${shader.fragmentShader}`;
        }
        // Encode before blending as the live sRGB canvas does. This also preserves translucent painted edges.
        shader.fragmentShader = shader.fragmentShader.replaceAll(
          "#include <colorspace_fragment>",
          "gl_FragColor = sRGBTransferOETF(gl_FragColor);",
        );
      };
      copy.customProgramCacheKey = () =>
        `${material.customProgramCacheKey.call(material)}|directional-screen:${toneMapping}:${copy.toneMapped}`;
      materials.set(material, copy);
      // Standard/Toon maps and shader texture uniforms both need independent GPU lifetimes.
      for (const key of Object.keys(copy)) {
        const value = (copy as unknown as Record<string, unknown>)[key];
        if (value instanceof THREE.Texture)
          (copy as unknown as Record<string, unknown>)[key] =
            copyTexture(value);
      }
      if (copy instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(copy.uniforms)) {
          if (uniform.value instanceof THREE.Texture)
            uniform.value = copyTexture(uniform.value);
        }
      }
    }
    return materials.get(material)!;
  };
  try {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (++meshCount > 256)
        throw Error("Directional capture exceeds 256 meshes");
      const geometry = node.geometry;
      if (!geometries.has(geometry)) {
        geometryBytes += geometry.index?.array.byteLength ?? 0;
        const attributes = [
          ...Object.values(geometry.attributes),
          ...Object.values(geometry.morphAttributes).flat(),
        ] as THREE.BufferAttribute[];
        for (const attribute of attributes)
          geometryBytes += attribute.array.byteLength;
        if (geometryBytes > 32 * 1024 * 1024)
          throw Error("Directional capture geometry exceeds 32 MiB");
        geometries.set(geometry, geometry.clone());
      }
      node.geometry = geometries.get(geometry)!;
      node.material = Array.isArray(node.material)
        ? node.material.map(copyMaterial)
        : copyMaterial(node.material);
      if (node.userData.comicOutline) {
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material]) {
          if (
            material instanceof THREE.ShaderMaterial &&
            material.uniforms.resolution?.value instanceof THREE.Vector2
          )
            material.uniforms.resolution.value.set(tileSize, tileSize);
        }
      }
      if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
      // Live callbacks often close over their original instance. Capturing must never invoke them.
      node.onBeforeRender = () => {};
      node.onAfterRender = () => {};
    });
    if (!meshCount)
      throw Error("Directional capture requires an assembled avatar");
    object.updateMatrixWorld(true);
    return {
      object,
      uploadTextures(renderer) {
        // Upload every map, including a back-facing piece not reached by the first camera.
        // Runtime image leases may end between views; the independent Source/version prevents later re-uploads.
        for (const texture of textures.values()) renderer.initTexture(texture);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * Freeze an assembled pose into sixteen transparent views. No live transforms, materials or renderer state are changed.
 * It intentionally does not run animation or rebuild recipes; call again after a part, color, pose or view-style change.
 */
export async function bakeDirectionalAtlas(
  renderer: THREE.WebGLRenderer,
  source: THREE.Object3D,
  options: DirectionalOptions = {},
): Promise<DirectionalAtlas> {
  checkAbort(options.signal);
  if (busy.has(renderer))
    throw Error("This renderer already has an active directional capture");
  const tileSize = options.tileSize ?? 256;
  requireTileSize(tileSize);
  const elevation = options.elevation ?? Math.PI / 24;
  const padding = options.padding ?? 0.08;
  if (!Number.isFinite(elevation) || elevation < 0 || elevation > Math.PI / 4)
    throw Error("Directional elevation must be between 0 and 45 degrees");
  if (!Number.isFinite(padding) || padding < 0.02 || padding > 0.5)
    throw Error("Directional padding must be between 0.02 and 0.5");
  if (tileSize * GRID > renderer.capabilities.maxTextureSize)
    throw Error("Directional atlas exceeds this device's texture limit");
  if (renderer.getContext().isContextLost())
    throw Error("Directional capture requires an active graphics context");
  if (!renderer.extensions.has("EXT_color_buffer_float"))
    throw Error(
      "Directional capture requires a graphics device with HDR render-target support",
    );
  if (options.lights && options.lights.length > 8)
    throw Error("Directional capture allows at most eight lights");
  if (
    renderer.toneMapping !== THREE.NoToneMapping &&
    !toneFunctions[renderer.toneMapping]
  )
    throw Error(
      "Directional capture does not support a custom renderer tone mapper",
    );
  if (renderer.outputColorSpace !== THREE.SRGBColorSpace)
    throw Error("Directional capture requires an sRGB renderer output");
  busy.add(renderer);
  let snapshot: Snapshot | undefined;
  let atlasTarget: THREE.WebGLRenderTarget | undefined;
  let tileTarget: THREE.WebGLRenderTarget | undefined;
  let outputMaterial: THREE.RawShaderMaterial | undefined;
  let outputGeometry: THREE.PlaneGeometry | undefined;
  try {
    snapshot = snapshotAvatar(
      source,
      tileSize,
      renderer.toneMapping,
      renderer.toneMappingExposure,
    );
    snapshot.uploadTextures(renderer);
    const bounds = new THREE.Box3().setFromObject(snapshot.object, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (
      ![...size, ...center].every(Number.isFinite) ||
      size.length() < 1e-5 ||
      size.length() > 100
    )
      throw Error("Directional capture has invalid avatar bounds");
    const radius = Math.hypot(size.x, size.z) / 2;
    const halfSize =
      Math.max(
        radius,
        (size.y * Math.cos(elevation)) / 2 + radius * Math.sin(elevation),
      ) *
      (1 + padding);
    const scene = new THREE.Scene();
    scene.add(snapshot.object);
    if (options.lights) {
      for (const light of options.lights) {
        const copy = light.clone();
        light.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
        copy.castShadow = false;
        if (
          copy instanceof THREE.DirectionalLight ||
          copy instanceof THREE.SpotLight
        ) {
          const target = (light as THREE.DirectionalLight | THREE.SpotLight)
            .target;
          copy.target = new THREE.Object3D();
          copy.target.position.setFromMatrixPosition(target.matrixWorld);
          scene.add(copy.target);
        }
        scene.add(copy);
      }
    } else {
      scene.add(new THREE.HemisphereLight("#fff6e8", "#65727a", 1.7));
      const key = new THREE.DirectionalLight("#fff0d9", 2.5);
      key.position.copy(center).add(new THREE.Vector3(3, 5, 4));
      key.target.position.copy(center);
      scene.add(key, key.target);
    }
    const camera = new THREE.OrthographicCamera(
      -halfSize,
      halfSize,
      halfSize,
      -halfSize,
      0.01,
      100,
    );
    const distance = Math.max(4, size.length() * 2);
    const atlasSize = tileSize * GRID;
    const renderTileSize = tileSize * 2;
    const frames = directionalFrames(tileSize);
    atlasTarget = new THREE.WebGLRenderTarget(atlasSize, atlasSize, {
      depthBuffer: false,
      generateMipmaps: false,
    });
    // Materials write their own tone-mapped (or deliberately unmapped) sRGB output into this tile.
    // Resolve a 2× supersampled silhouette into each atlas tile. The final texture stays bounded,
    // while slanted ink contours and fingers acquire coverage instead of staircase edges.
    tileTarget = new THREE.WebGLRenderTarget(renderTileSize, renderTileSize, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      samples: 0,
    });
    outputMaterial = new THREE.RawShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(OutputShader.uniforms),
      vertexShader: OutputShader.vertexShader,
      fragmentShader: OutputShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    outputMaterial.uniforms.tDiffuse.value = tileTarget.texture;
    outputGeometry = new THREE.PlaneGeometry(2, 2);
    const outputScene = new THREE.Scene();
    outputScene.add(new THREE.Mesh(outputGeometry, outputMaterial));
    const outputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const yieldFrame =
      options.yieldBetweenFrames ??
      (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    for (const frame of frames) {
      checkAbort(options.signal);
      if (renderer.getContext().isContextLost())
        throw Error("Graphics context was lost during directional capture");
      const state = {
        target: renderer.getRenderTarget(),
        cubeFace: renderer.getActiveCubeFace(),
        mip: renderer.getActiveMipmapLevel(),
        viewport: renderer.getViewport(new THREE.Vector4()),
        scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest(),
        clear: renderer.getClearColor(new THREE.Color()),
        alpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear,
        xr: renderer.xr.enabled,
        shadows: renderer.shadowMap.autoUpdate,
      };
      try {
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.autoClear = false;
        renderer.setClearColor(0, 0);
        renderer.setScissorTest(false);
        tileTarget.viewport.set(0, 0, renderTileSize, renderTileSize);
        renderer.setRenderTarget(tileTarget);
        renderer.clear(true, true, true);
        camera.position
          .set(
            Math.sin(frame.azimuth) * Math.cos(elevation),
            Math.sin(elevation),
            Math.cos(frame.azimuth) * Math.cos(elevation),
          )
          .multiplyScalar(distance)
          .add(center);
        camera.lookAt(center);
        renderer.render(scene, camera);
        // A render target's viewport is already in device pixels. renderer.setViewport would multiply by devicePixelRatio again.
        atlasTarget.viewport.set(
          frame.rect.x,
          atlasSize - frame.rect.y - tileSize,
          tileSize,
          tileSize,
        );
        renderer.setRenderTarget(atlasTarget);
        renderer.render(outputScene, outputCamera);
      } finally {
        renderer.setViewport(state.viewport);
        renderer.setScissor(state.scissor);
        renderer.setScissorTest(state.scissorTest);
        renderer.setRenderTarget(state.target, state.cubeFace, state.mip);
        renderer.setClearColor(state.clear, state.alpha);
        renderer.autoClear = state.autoClear;
        renderer.xr.enabled = state.xr;
        renderer.shadowMap.autoUpdate = state.shadows;
      }
      options.onProgress?.(frame.index + 1, DIRECTION_COUNT);
      await yieldFrame();
    }
    checkAbort(options.signal);
    if (renderer.getContext().isContextLost())
      throw Error("Graphics context was lost during directional capture");
    const pixels = new Uint8Array(atlasSize * atlasSize * 4);
    renderer.readRenderTargetPixels(
      atlasTarget,
      0,
      0,
      atlasSize,
      atlasSize,
      pixels,
    );
    let visible = false;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] > 0) {
        visible = true;
        break;
      }
    }
    if (!visible)
      throw Error("Directional capture produced no visible avatar pixels");
    return new DirectionalAtlas(
      {
        version: 1,
        projection: "orthographic-16",
        width: atlasSize,
        height: atlasSize,
        tileSize,
        columns: GRID,
        rows: GRID,
        elevation,
        center: center.toArray(),
        worldSize: halfSize * 2,
        colorSpace: "srgb",
        pixelOrder: "bottom-up-rgba8",
        textureBytes: pixels.byteLength,
        frames,
      },
      pixels,
    );
  } finally {
    snapshot?.dispose();
    atlasTarget?.dispose();
    tileTarget?.dispose();
    outputMaterial?.dispose();
    outputGeometry?.dispose();
    busy.delete(renderer);
  }
}
