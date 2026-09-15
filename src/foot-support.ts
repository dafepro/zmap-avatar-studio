import * as THREE from "three";
import { ConvexHull } from "three/addons/math/ConvexHull.js";

/** Extract the actual rigid shoe shell once after assembly/body fitting. A convex
 * hull has exactly the same minimum in every support direction as its source
 * vertices; rotating a handful of hull points replaces per-frame mesh scans.
 * Flexible fabric is excluded: socks follow the shin, not the rigid shoe frame.
 */
export function shoeSupportHulls(
  root: THREE.Group,
  sockets: Map<string, THREE.Bone>,
  shoeIds: Set<string>,
) {
  const points = {
    L: new Map<string, THREE.Vector3>(),
    R: new Map<string, THREE.Vector3>(),
  };
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let part: THREE.Object3D | null = object;
    while (part && !part.userData.assetId) part = part.parent;
    if (!part || !shoeIds.has(part.userData.assetId)) return;
    const rigidParent = (() => {
      let parent = object.parent;
      while (parent && !(parent instanceof THREE.Bone)) parent = parent.parent;
      return parent;
    })();
    for (let i = 0; i < object.geometry.attributes.position.count; i++) {
      let side: "L" | "R" | undefined;
      if (object instanceof THREE.SkinnedMesh) {
        const indices = object.geometry.attributes.skinIndex,
          weights = object.geometry.attributes.skinWeight;
        for (let j = 0; j < 4; j++) {
          if (weights.getComponent(i, j) < 0.9999) continue;
          const bone = object.skeleton.bones[indices.getComponent(i, j)]?.name;
          if (bone === "foot_L" || bone === "foot_R")
            side = bone === "foot_L" ? "L" : "R";
        }
      } else if (
        rigidParent?.name === "foot_L" ||
        rigidParent?.name === "foot_R"
      )
        side = rigidParent.name === "foot_L" ? "L" : "R";
      if (!side) continue;
      const ankle = sockets.get(`foot_${side}`);
      if (!ankle) continue;
      const p = ankle.worldToLocal(
        object
          .getVertexPosition(i, new THREE.Vector3())
          .applyMatrix4(object.matrixWorld),
      );
      points[side].set(
        p
          .toArray()
          .map((v) => v.toFixed(6))
          .join(","),
        p,
      );
    }
  });
  return new Map(
    (["L", "R"] as const).flatMap((side) => {
      const vertices = [...points[side].values()];
      if (vertices.length < 4) return [];
      const hull = new ConvexHull().setFromPoints(vertices),
        unique = new Set<THREE.Vector3>();
      for (const face of hull.faces) {
        let edge = face.edge;
        do {
          unique.add(edge.head().point);
          edge = edge.next;
        } while (edge !== face.edge);
      }
      return [[side, [...unique]] as const];
    }),
  );
}
