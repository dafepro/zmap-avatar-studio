import * as THREE from "three";
import { applyExpressionProjection } from "./expression.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/** Presentation controls, independent of appearance recipes or world lighting. */
export interface ComicStyleOptions {
  /** Silhouette width in drawing-buffer pixels. Zero disables the extra draw. */
  inkWidth?: number;
  /** Strength of broad painted shadow shapes, from 0 to 1. */
  shadowStrength?: number;
  /** Very subtle, object-anchored pigment variation, from 0 to 1. */
  pigment?: number;
  inkColor?: THREE.ColorRepresentation;
}

const normalVertex = `
uniform vec3 illustratedCenter;
uniform vec3 illustratedRadius;
uniform float illustratedFace;
varying vec3 vIllustratedNormal;
varying vec3 vIllustratedPosition;
`;
const paintFragment = `
uniform float illustratedShadow;
uniform float illustratedPigment;
uniform float illustratedFeature;
varying vec3 vIllustratedNormal;
varying vec3 vIllustratedPosition;
// Continuous low-frequency pigment stays on the surface when the camera or bones move.
// No screen-space hash, frame counter, or animated noise.
float illustratedWash(vec3 p) {
  return (sin(dot(p, vec3(53.0, 37.0, 29.0))) *
          sin(dot(p, vec3(-19.0, 61.0, 43.0))) +
          0.4 * sin(dot(p, vec3(117.0, -83.0, 71.0)))) / 1.4;
}
`;

/**
 * Broad painted light and restrained silhouette ink. Facial detail is authored
 * color; the head lights as one volume rather than revealing its triangle grid.
 * Optional view treatment: no source geometry, sockets or recipe are modified.
 */
export class ComicStyle {
  private root?: THREE.Object3D;
  private entries: {
    mesh: THREE.Mesh;
    original: THREE.Material | THREE.Material[];
    painted: THREE.Material | THREE.Material[];
    outline?: THREE.Mesh;
  }[] = [];
  private resolution = new THREE.Vector2(1000, 1000);
  private readonly options: Required<ComicStyleOptions>;

  constructor(options: ComicStyleOptions = {}) {
    const bounded = (value: number | undefined, fallback: number, max = 1) =>
      Number.isFinite(value) ? THREE.MathUtils.clamp(value!, 0, max) : fallback;
    this.options = {
      inkWidth: bounded(options.inkWidth, 1.45, 3),
      shadowStrength: bounded(options.shadowStrength, 0.82),
      pigment: bounded(options.pigment, 0.35),
      inkColor: options.inkColor ?? "#20252a",
    };
  }

  private paint(
    material: THREE.Material,
    mesh: THREE.Mesh,
    assetId: string,
  ): THREE.Material {
    const source = material as THREE.MeshStandardMaterial;
    // Keep glTF maps, vertex colors, alpha masks and palette colors. Painting
    // details onto the model must work identically in either presentation mode.
    const painted = new THREE.MeshBasicMaterial({
      color: source.color ?? "#ffffff",
      map: source.map ?? null,
      alphaMap: source.alphaMap ?? null,
      vertexColors: material.vertexColors,
      side: material.side,
      transparent: material.transparent,
      opacity: material.opacity,
      alphaTest: material.alphaTest,
      depthWrite: material.depthWrite,
      depthTest: material.depthTest,
      // Preserve the approved palette; scene exposure must not bleach skin/ink.
      toneMapped: false,
    });
    painted.name = material.name;
    painted.userData.illustrated = true;
    const feature =
      assetId.startsWith("face-") || assetId.startsWith("effect-");
    const skin = material.name === "skin";
    const head = assetId.startsWith("head-") && skin;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox!;
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    radius.max(new THREE.Vector3(0.001, 0.001, 0.001));
    painted.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        illustratedCenter: { value: center },
        illustratedRadius: { value: radius },
        illustratedFace: { value: head ? 1 : 0 },
        illustratedFeature: { value: feature ? 1 : 0 },
        illustratedShadow: {
          value: this.options.shadowStrength * (skin ? 0.85 : 1),
        },
        illustratedPigment: { value: this.options.pigment },
      });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${normalVertex}`)
        // Basic material normally computes normals only for env maps/skinning.
        // Always compute them, using Three's morph + skin normal transforms.
        .replace(
          "#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )",
          "#if 1",
        )
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
          vec3 faceNormal = (position - illustratedCenter) / illustratedRadius;
          faceNormal *= vec3(0.78, 0.46, 1.0);
          objectNormal = normalize(mix(objectNormal, normalize(faceNormal + vec3(0.0, 0.0, 0.0001)), illustratedFace));`,
        )
        .replace(
          "#include <defaultnormal_vertex>",
          `#include <defaultnormal_vertex>
          vIllustratedNormal = normalize(transformedNormal);
          vIllustratedPosition = position;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${paintFragment}`)
        .replace(
          "#include <opaque_fragment>",
          `
          vec3 paintedNormal = normalize(vIllustratedNormal);
          // One steady light direction keeps all pieces in the same drawing.
          vec3 paintedLight = normalize(mat3(viewMatrix) * vec3(-0.65, 0.75, 0.65));
          float illumination = dot(paintedNormal, paintedLight);
          // Three broad cel families. Derivative antialiasing softens only the
          // boundary pixel, preserving an ink illustration instead of an airbrush.
          float edge = max(fwidth(illumination), 0.012);
          float lightShape = smoothstep(0.08-edge, 0.08+edge, illumination);
          float highlightShape = smoothstep(0.54-edge, 0.54+edge, illumination);
          vec3 wash = mix(vec3(0.48, 0.46, 0.49), vec3(0.78, 0.77, 0.76), lightShape);
          wash = mix(wash, vec3(1.02, 1.0, 0.97), highlightShape);
          wash = mix(vec3(1.0), wash, illustratedShadow);
          // Derivative fade removes tiny grain before it can shimmer at world scale.
          float grainScale = max(length(fwidth(vIllustratedPosition)), 0.00001);
          float grain = illustratedWash(vIllustratedPosition) *
            (1.0 - smoothstep(0.006, 0.025, grainScale));
          wash *= 1.0 + grain * illustratedPigment * 0.025;
          outgoingLight *= mix(wash, vec3(1.0), illustratedFeature);
          #include <opaque_fragment>`,
        );
    };
    painted.customProgramCacheKey = () => "zmap-reference-ink-v4";
    painted.userData.expressionProjection =
      source.userData.expressionProjection;
    applyExpressionProjection(painted);
    return painted;
  }

  private outline(mesh: THREE.Mesh): THREE.Mesh {
    // Recompute normals on a welded copy so UV/material splits never become ink
    // cracks. Keep skin attributes: an ink shell must deform with its character.
    const source = new THREE.BufferGeometry();
    for (const name of ["position", "skinIndex", "skinWeight"]) {
      const attribute = mesh.geometry.getAttribute(name);
      if (attribute) source.setAttribute(name, attribute.clone());
    }
    if (mesh.geometry.index) source.setIndex(mesh.geometry.index.clone());
    const geometry = mergeVertices(source, 1e-5);
    source.dispose();
    geometry.computeVertexNormals();
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        resolution: { value: this.resolution },
        width: { value: this.options.inkWidth },
        ink: { value: new THREE.Color(this.options.inkColor) },
      },
      vertexShader: `
        #include <common>
        #include <skinning_pars_vertex>
        uniform vec2 resolution;
        uniform float width;
        void main() {
          #include <beginnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <defaultnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          #include <project_vertex>
          vec3 n = normalize(transformedNormal);
          #ifdef FLIP_SIDED
            n = -n;
          #endif
          vec2 direction = normalize(n.xy + vec2(0.00001));
          float stroke = 0.96 + 0.04 * sin(dot(position, vec3(43.0, 17.0, 31.0)));
          gl_Position.xy += direction * width * stroke * 2.0 / resolution * gl_Position.w;
        }`,
      fragmentShader: `
        uniform vec3 ink;
        void main() {
          gl_FragColor = vec4(ink, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    let outline: THREE.Mesh;
    if (mesh instanceof THREE.SkinnedMesh) {
      const skinned = new THREE.SkinnedMesh(geometry, material);
      skinned.bindMode = mesh.bindMode;
      skinned.bind(mesh.skeleton, mesh.bindMatrix);
      outline = skinned;
    } else outline = new THREE.Mesh(geometry, material);
    outline.name = "Comic outline";
    outline.userData.comicOutline = true;
    outline.frustumCulled = mesh.frustumCulled;
    outline.renderOrder = -1;
    return outline;
  }

  update(root: THREE.Object3D | undefined, resolution: THREE.Vector2) {
    this.resolution.set(Math.max(1, resolution.x), Math.max(1, resolution.y));
    if (root === this.root) return;
    this.clear(false);
    this.root = root;
    if (!root) return;
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.comicOutline) meshes.push(o);
    });
    for (const mesh of meshes) {
      const original = mesh.material;
      let part: THREE.Object3D | null = mesh;
      while (part && !part.userData.assetId) part = part.parent;
      const assetId = String(part?.userData.assetId ?? "");
      const paint = (m: THREE.Material) => this.paint(m, mesh, assetId);
      mesh.material = Array.isArray(original)
        ? original.map(paint)
        : paint(original);
      const materials = Array.isArray(original) ? original : [original];
      const hasCutout = materials.some((m) => m.transparent || m.alphaTest > 0);
      let outline: THREE.Mesh | undefined;
      if (
        this.options.inkWidth > 0 &&
        !assetId.startsWith("face-") &&
        !assetId.startsWith("effect-") &&
        !hasCutout
      ) {
        outline = this.outline(mesh);
        mesh.add(outline);
      }
      this.entries.push({ mesh, original, painted: mesh.material, outline });
    }
  }

  /** Restore originals on a live avatar; release both sets after replacement. */
  clear(restore = true) {
    const materials = new Set<THREE.Material>();
    for (const e of this.entries) {
      for (const m of Array.isArray(e.painted) ? e.painted : [e.painted])
        materials.add(m);
      if (restore && this.root?.parent) e.mesh.material = e.original;
      else
        for (const m of Array.isArray(e.original) ? e.original : [e.original])
          materials.add(m);
      if (e.outline) {
        e.mesh.remove(e.outline);
        e.outline.geometry.dispose();
        (e.outline.material as THREE.Material).dispose();
      }
    }
    for (const m of materials) m.dispose();
    this.entries = [];
    this.root = undefined;
  }

  dispose() {
    this.clear();
  }
}
