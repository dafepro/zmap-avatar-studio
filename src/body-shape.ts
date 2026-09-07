import * as THREE from "three";
import type { Catalog } from "./core.js";

/** Tissue changes around each limb's own rest centerline. Joint centers, bone
 * lengths and pose stay fixed. Skin and clothing sample the same spatial field.
 * The torso has a separate width/depth profile; no clothing-by-weight variants.
 */
export function applyBodyShape(
  root: THREE.Group,
  sockets: Map<string, THREE.Bone>,
  shape: NonNullable<Catalog["bodyShape"]>,
  weight: number,
) {
  if (!weight) return;
  root.updateMatrixWorld(true);
  const amount = weight < 0 ? weight * shape.leanFactor : weight;
  const profile = shape.weightProfile;
  const neckOrigin = shape.neck
    ? sockets.get(shape.neck.socket)!.getWorldPosition(new THREE.Vector3())
    : undefined;
  const limbs = shape.limbs.map((limb) => {
    const joints = limb.joints.map((id) =>
      sockets.get(id)!.getWorldPosition(new THREE.Vector3()),
    );
    const lengths = joints.slice(1).map((p, i) => p.distanceTo(joints[i]));
    return {
      ...limb,
      joints,
      lengths,
      total: lengths.reduce((a, b) => a + b, 0),
    };
  });
  const deform = (point: THREE.Vector3) => {
    const body = point.clone(),
      upper = profile.findIndex((row) => row[0] >= point.y);
    if (upper > 0) {
      const a = profile[upper - 1],
        b = profile[upper],
        t = THREE.MathUtils.smoothstep(point.y, a[0], b[0]);
      body.x *= 1 + amount * THREE.MathUtils.lerp(a[1], b[1], t);
      body.z *= 1 + amount * THREE.MathUtils.lerp(a[2], b[2], t);
    }
    let best:
      | {
          distance: number;
          radius: number;
          falloff: number;
          delta: THREE.Vector3;
          gain: number;
        }
      | undefined;
    for (const limb of limbs) {
      let traveled = 0;
      for (let i = 0; i < limb.lengths.length; i++) {
        const length = limb.lengths[i],
          start = limb.joints[i],
          axis = limb.joints[i + 1].clone().sub(start).normalize();
        const along = point.clone().sub(start).dot(axis);
        const last = i === limb.lengths.length - 1;
        // Extend the terminal protection zone across the hand/foot, where gain
        // is zero. Torso scaling must never leak onto a palm near hip height.
        const distanceAlong = THREE.MathUtils.clamp(
          along,
          0,
          length + (last ? limb.endMargin : 0),
        );
        const center = start.clone().addScaledVector(axis, distanceAlong);
        const delta = point.clone().sub(center),
          distance = delta.length();
        const t = THREE.MathUtils.clamp(
          (traveled + distanceAlong) / limb.total,
          0,
          1,
        );
        const upper = limb.profile.findIndex((row) => row[0] >= t);
        let gain = limb.profile[0][1];
        if (upper > 0) {
          const a = limb.profile[upper - 1],
            b = limb.profile[upper];
          gain = THREE.MathUtils.lerp(
            a[1],
            b[1],
            THREE.MathUtils.smoothstep(t, a[0], b[0]),
          );
        }
        // Only perpendicular tissue expands; the centerline never moves.
        delta.addScaledVector(axis, -delta.dot(axis));
        if (!best || distance < best.distance)
          best = {
            distance,
            radius: limb.radius,
            falloff: limb.falloff,
            delta,
            gain,
          };
        traveled += length;
      }
    }
    if (best) {
      const influence =
        1 -
        THREE.MathUtils.smoothstep(
          best.distance,
          best.radius,
          best.radius + best.falloff,
        );
      body.lerp(
        point.clone().addScaledVector(best.delta, amount * best.gain),
        influence,
      );
    }
    if (shape.neck && neckOrigin) {
      const neck = shape.neck,
        local = point.clone().sub(neckOrigin);
      const fraction = (local.y - neck.bottom) / (neck.top - neck.bottom);
      const vertical =
        THREE.MathUtils.smoothstep(fraction, 0, 0.38) *
        (1 - THREE.MathUtils.smoothstep(fraction, 0.65, 1));
      const radial =
        1 -
        THREE.MathUtils.smoothstep(
          Math.hypot(local.x, local.z),
          neck.radius,
          neck.radius + neck.falloff,
        );
      const gain = amount * neck.gain * vertical * radial;
      body.x += local.x * gain;
      body.z += local.z * gain;
    }
    return body;
  };
  root.updateMatrixWorld(true);
  const meshes: { mesh: THREE.Mesh; world: THREE.Vector3[] }[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const world = Array.from(
      { length: object.geometry.getAttribute("position").count },
      (_, i) =>
        deform(
          object
            .getVertexPosition(i, new THREE.Vector3())
            .applyMatrix4(object.matrixWorld),
        ),
    );
    meshes.push({ mesh: object, world });
  });
  // Bake each source rest result before rebinding. Inverse binds may contain
  // arbitrary Blender bone bases; preserving only local vertex coordinates
  // would apply those rest transforms twice. Skeleton positions stay untouched.
  const replacements = new Map<THREE.Skeleton, THREE.Skeleton>();
  for (const { mesh, world } of meshes) {
    const inverse = mesh.matrixWorld.clone().invert();
    const position = mesh.geometry.getAttribute("position");
    world.forEach((point, i) => {
      point.applyMatrix4(inverse);
      position.setXYZ(i, point.x, point.y, point.z);
    });
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    if (mesh instanceof THREE.SkinnedMesh) {
      if (!replacements.has(mesh.skeleton))
        replacements.set(
          mesh.skeleton,
          new THREE.Skeleton(mesh.skeleton.bones),
        );
      mesh.bind(replacements.get(mesh.skeleton)!, mesh.matrixWorld);
    }
  }
  for (const old of replacements.keys()) old.dispose();
}
