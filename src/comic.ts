import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
/** Optional view treatment. Geometry, sockets, recipe and animation remain unchanged. */
export class ComicStyle {
  private root?: THREE.Object3D;
  private entries: {
    mesh: THREE.Mesh;
    original: THREE.Material | THREE.Material[];
    toon: THREE.Material | THREE.Material[];
    outline?: THREE.Mesh;
  }[] = [];
  private gradient = new THREE.DataTexture(
    new Uint8Array([72, 132, 204, 255]),
    4,
    1,
    THREE.RedFormat,
  );
  private resolution = new THREE.Vector2(1000, 1000);
  constructor() {
    this.gradient.minFilter = THREE.NearestFilter;
    this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.generateMipmaps = false;
    this.gradient.needsUpdate = true;
  }
  update(root: THREE.Object3D | undefined, resolution: THREE.Vector2) {
    this.resolution.copy(resolution);
    if (root === this.root) return;
    this.clear(false);
    this.root = root;
    if (!root) return;
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    const palette = new Map<THREE.Material, THREE.Material>();
    for (const mesh of meshes) {
      const original = mesh.material;
      const toon = (m: THREE.Material) => {
        if (!palette.has(m)) {
          const source = m as THREE.MeshStandardMaterial;
          const t = new THREE.MeshToonMaterial({
            color: source.color ?? "#ffffff",
            gradientMap: this.gradient,
            side: m.side,
            transparent: m.transparent,
            opacity: m.opacity,
          });
          t.name = m.name;
          palette.set(m, t);
        }
        return palette.get(m)!;
      };
      mesh.material = Array.isArray(original)
        ? original.map(toon)
        : toon(original);
      let part: THREE.Object3D | null = mesh;
      while (part && !part.userData.assetId) part = part.parent;
      let outline: THREE.Mesh | undefined;
      if (
        !String(part?.userData.assetId).startsWith("face-") &&
        !String(part?.userData.assetId).startsWith("effect-")
      ) {
        // Weld positions before computing hull normals; glTF's flat-shading seams must not split the outline.
        const source = new THREE.BufferGeometry();
        source.setAttribute(
          "position",
          mesh.geometry.attributes.position.clone(),
        );
        if (mesh.geometry.index) source.setIndex(mesh.geometry.index.clone());
        const geometry = mergeVertices(source, 1e-5);
        source.dispose();
        geometry.computeVertexNormals();
        const material = new THREE.ShaderMaterial({
          side: THREE.BackSide,
          uniforms: {
            resolution: { value: this.resolution },
            width: { value: 1.3 },
            ink: { value: new THREE.Color("#302630") },
          },
          vertexShader: `uniform vec2 resolution;uniform float width;void main(){vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);vec3 n=normalize(normalMatrix*normal);vec2 direction=normalize(n.xy+vec2(0.00001));p.xy+=direction*width*2.0/resolution*p.w;gl_Position=p;}`,
          fragmentShader:
            `uniform vec3 ink;void main(){gl_FragColor=vec4(ink,1.0);#include <colorspace_fragment>}`.replace(
              ";#include",
              ";\n#include",
            ),
        });
        outline = new THREE.Mesh(geometry, material);
        outline.name = "Comic outline";
        outline.userData.comicOutline = true;
        outline.renderOrder = -1;
        mesh.add(outline);
      }
      this.entries.push({ mesh, original, toon: mesh.material, outline });
    }
  }
  /** Restore original materials when switching modes; release both sets when a prior avatar was replaced. */
  clear(restore = true) {
    const materials = new Set<THREE.Material>();
    for (const e of this.entries) {
      for (const m of Array.isArray(e.toon) ? e.toon : [e.toon])
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
    this.gradient.dispose();
  }
}
