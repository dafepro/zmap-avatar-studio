/** Diagnostic, not a blanket clothing-fit pass. Copy into tests/helpers in a
 * worktree so `three` resolves through that worktree's installed dependency.
 * Rest input must be captured immediately after setAppearance, before motion.
 * Triangle crossings include hidden concave-fold overlaps. Visibility probes
 * separately identify skin actually exposed from eight exterior azimuths.
 */
import * as THREE from "three";
export function assetMeshes(root: THREE.Object3D, id: string) {
  const result: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let p: THREE.Object3D | null = o;
    while (p && !p.userData.assetId) p = p.parent;
    if (p?.userData.assetId === id) result.push(o);
  });
  return result;
}
function posed(m: THREE.Mesh) {
  if (m instanceof THREE.SkinnedMesh) m.skeleton.update();
  return Array.from(
    { length: m.geometry.getAttribute("position").count },
    (_, i) =>
      m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld),
  );
}
function triangles(meshes: THREE.Mesh[]) {
  return meshes.flatMap((m) => {
    const pp = posed(m),
      ix = m.geometry.index;
    return Array.from({ length: (ix?.count ?? pp.length) / 3 }, (_, k) =>
      [0, 1, 2].map((j) => pp[ix?.getX(k * 3 + j) ?? k * 3 + j]),
    );
  });
}
export function captureRestAnatomy(
  root: THREE.Object3D,
  bodyId = "body-athletic",
) {
  root.updateMatrixWorld(true);
  return new Map(assetMeshes(root, bodyId).map((m) => [m, posed(m)]));
}
export function measureTrouserClearance(
  root: THREE.Object3D,
  bottomId: string,
  original: Map<THREE.Mesh, THREE.Vector3[]>,
) {
  root.updateMatrixWorld(true);
  const anatomy = [...original.keys()],
    clothMeshes = assetMeshes(root, bottomId),
    cloth = triangles(clothMeshes),
    skin = triangles(anatomy.filter(actuallyVisible)),
    apertures = cuffApertures(clothMeshes);
  const legSurface: THREE.Vector3[][] = [],
    samples: THREE.Vector3[] = [],
    origins = new Map<string, number[]>();
  for (const m of anatomy) {
    const rest = original.get(m)!,
      pp = posed(m),
      ix = m.geometry.index;
    for (let k = 0; k < (ix?.count ?? pp.length); k += 3) {
      const ids = [0, 1, 2].map((j) => ix?.getX(k + j) ?? k + j);
      if (
        ids.every(
          (i) =>
            rest[i].y > 0.39 && rest[i].y < 1.025 && Math.abs(rest[i].x) < 0.3,
        )
      )
        legSurface.push(ids.map((i) => pp[i]));
      if (
        actuallyVisible(m) &&
        ids.every(
          (i) =>
            rest[i].y > 0.44 && rest[i].y < 0.965 && Math.abs(rest[i].x) < 0.3,
        )
      ) {
        const center = ids
          .reduce((a, i) => a.add(pp[i]), new THREE.Vector3())
          .multiplyScalar(1 / 3);
        samples.push(...ids.map((i) => pp[i]), center);
        for (const i of ids)
          origins.set(pp[i].toArray().join(","), rest[i].toArray());
        origins.set(
          center.toArray().join(","),
          ids
            .reduce((a, i) => a.add(rest[i]), new THREE.Vector3())
            .multiplyScalar(1 / 3)
            .toArray(),
        );
      }
    }
  }
  let bodyCrossings = 0;
  const crossingPoints: number[][] = [];
  const tmp = new THREE.Vector3();
  for (const [source, target] of [
    [legSurface, cloth],
    [cloth, legSurface],
  ])
    for (const tri of source)
      for (let edge = 0; edge < 3; edge++) {
        const start = tri[edge],
          direction = tri[(edge + 1) % 3].clone().sub(start),
          length = direction.length();
        if (length < 0.0002) continue;
        const ray = new THREE.Ray(start, direction.normalize());
        for (const other of target) {
          const hit = ray.intersectTriangle(
            other[0],
            other[1],
            other[2],
            false,
            tmp,
          );
          if (
            hit &&
            hit.distanceTo(start) > 0.0001 &&
            hit.distanceTo(start) < length - 0.0001
          ) {
            bodyCrossings++;
            if (crossingPoints.length < 5) crossingPoints.push(hit.toArray());
            break;
          }
        }
      }
  let visibleSamples = 0,
    naturalCuffSamples = 0;
  const exposedSamples: {
    view: number;
    point: number[];
    source: number[] | undefined;
    skinDistance: number;
    clothDistance: number;
  }[] = [];
  for (let view = 0; view < 8; view++) {
    const yaw = (view * Math.PI) / 4,
      direction = new THREE.Vector3(
        Math.sin(yaw),
        0.05,
        Math.cos(yaw),
      ).normalize();
    for (const p of samples) {
      const ray = new THREE.Ray(
        p.clone().addScaledVector(direction, 3),
        direction.clone().negate(),
      );
      let skinDistance = Infinity;
      for (const tri of skin) {
        const hit = ray.intersectTriangle(tri[0], tri[1], tri[2], false, tmp);
        if (hit)
          skinDistance = Math.min(skinDistance, ray.origin.distanceTo(hit));
      }
      if (skinDistance < 2.999) continue;
      visibleSamples++;
      let clothDistance = Infinity;
      for (const tri of cloth) {
        const hit = ray.intersectTriangle(tri[0], tri[1], tri[2], false, tmp);
        if (hit)
          clothDistance = Math.min(clothDistance, ray.origin.distanceTo(hit));
      }
      if (clothDistance > 3.001) {
        const throughCuff = apertures.triangles.some((tri) => {
          const hit = ray.intersectTriangle(tri[0], tri[1], tri[2], false, tmp);
          return (
            hit !== null && ray.origin.distanceTo(hit) < skinDistance + 0.001
          );
        });
        if (throughCuff) naturalCuffSamples++;
        else if (exposedSamples.length < 12)
          exposedSamples.push({
            view,
            point: p.toArray(),
            source: origins.get(p.toArray().join(",")),
            skinDistance,
            clothDistance,
          });
      }
    }
  }
  return {
    bodyCrossings,
    crossingPoints,
    visibleSamples,
    naturalCuffSamples,
    cuffApertures: apertures.loops,
    exposedSamples,
  };
}

function actuallyVisible(mesh: THREE.Object3D) {
  let o: THREE.Object3D | null = mesh;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}
/** Lowest open boundary loop on each leg, welded across primitive/normal splits.
 * A ray through this real wearing aperture may legitimately see the inner calf.
 * Internal seams and patch edges above the wearing edge cannot exempt a leak. */
function cuffApertures(meshes: THREE.Mesh[]) {
  const vertices = new Map<
      string,
      { rest: THREE.Vector3; posed: THREE.Vector3 }
    >(),
    edges = new Map<string, { a: string; b: string; count: number }>();
  for (const m of meshes) {
    const position = m.geometry.getAttribute("position"),
      pp = posed(m),
      ix = m.geometry.index;
    const keys = Array.from({ length: position.count }, (_, i) => {
      const rest = new THREE.Vector3().fromBufferAttribute(position, i),
        key = rest
          .toArray()
          .map((v) => Math.round(v * 1e5))
          .join(":");
      if (!vertices.has(key)) vertices.set(key, { rest, posed: pp[i] });
      return key;
    });
    for (let k = 0; k < (ix?.count ?? keys.length); k += 3)
      for (let j = 0; j < 3; j++) {
        const a = keys[ix?.getX(k + j) ?? k + j],
          b = keys[ix?.getX(k + ((j + 1) % 3)) ?? k + ((j + 1) % 3)];
        if (a === b) continue;
        const key = [a, b].sort().join("|");
        const edge = edges.get(key);
        if (edge) edge.count++;
        else edges.set(key, { a, b, count: 1 });
      }
  }
  const graph = new Map<string, string[]>();
  for (const e of edges.values())
    if (e.count === 1) {
      graph.set(e.a, [...(graph.get(e.a) ?? []), e.b]);
      graph.set(e.b, [...(graph.get(e.b) ?? []), e.a]);
    }
  const seen = new Set<string>(),
    loops: { center: THREE.Vector3; points: THREE.Vector3[] }[] = [];
  for (const start of graph.keys()) {
    if (seen.has(start)) continue;
    const queue = [start],
      component: string[] = [];
    while (queue.length) {
      const key = queue.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      component.push(key);
      for (const next of graph.get(key) ?? [])
        if (!seen.has(next)) queue.push(next);
    }
    if (
      component.length < 3 ||
      component.some((key) => graph.get(key)!.length !== 2)
    )
      continue;
    const ordered = [start];
    let previous = "",
      current = start;
    while (ordered.length < component.length) {
      const next = graph.get(current)!.find((key) => key !== previous)!;
      if (next === start) break;
      ordered.push(next);
      previous = current;
      current = next;
    }
    if (ordered.length !== component.length) continue;
    const center = ordered
      .reduce((p, key) => p.add(vertices.get(key)!.rest), new THREE.Vector3())
      .multiplyScalar(1 / ordered.length);
    if (center.y > 0.75 || Math.abs(center.x) < 0.03) continue;
    loops.push({
      center,
      points: ordered.map((key) => vertices.get(key)!.posed),
    });
  }
  const chosen = [-1, 1]
    .map(
      (side) =>
        loops
          .filter((loop) => Math.sign(loop.center.x) === side)
          .sort((a, b) => a.center.y - b.center.y)[0],
    )
    .filter(Boolean);
  const triangles: THREE.Vector3[][] = [];
  for (const loop of chosen) {
    const center = loop.points
      .reduce((p, q) => p.add(q), new THREE.Vector3())
      .multiplyScalar(1 / loop.points.length);
    for (let i = 0; i < loop.points.length; i++)
      triangles.push([
        center,
        loop.points[i],
        loop.points[(i + 1) % loop.points.length],
      ]);
  }
  return {
    triangles,
    loops: chosen.map((loop) => ({
      center: loop.center.toArray(),
      vertices: loop.points.length,
    })),
  };
}
