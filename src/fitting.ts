import * as THREE from "three";
import { AvatarError, type Asset } from "./core.js";

type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

/** Split triangles at deformation boundaries so long edges cannot bridge
 * across a narrow clearance region. Interpolate all authored attributes.
 */
function splitBoundary(
  mesh: THREE.Mesh,
  matrix: THREE.Matrix4,
  axis: "x" | "y" | "z",
  value: number,
  region?: {
    center: THREE.Vector3;
    radius: THREE.Vector3;
    axis: "x" | "y" | "z";
    direction: number;
  },
) {
  const source = mesh.geometry,
    index = source.index;
  const names = Object.keys(source.attributes);
  if (
    names.some(
      (name) =>
        source.getAttribute(name) instanceof THREE.InterleavedBufferAttribute,
    )
  )
    throw new AvatarError("fit", "Fitting needs unpacked vertex attributes");
  const sizes = names.map((name) => source.getAttribute(name).itemSize);
  const offsets = sizes.map((_, i) =>
    sizes.slice(0, i).reduce((n, v) => n + v, 0),
  );
  const pos = offsets[names.indexOf("position")];
  const output: number[][] = names.map(() => []);
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  let count = 0;
  const coordinate = (v: number[]) =>
    new THREE.Vector3(v[pos], v[pos + 1], v[pos + 2]).applyMatrix4(matrix)[
      axis
    ] - value;
  const read = (i: number) =>
    names.flatMap((name) => {
      const a = source.getAttribute(name);
      return Array.from({ length: a.itemSize }, (_, j) => a.getComponent(i, j));
    });
  const emit = (polygon: number[][], materialIndex: number) => {
    for (let i = 1; i < polygon.length - 1; i++) {
      if (count >= 60000)
        throw new AvatarError(
          "budget",
          "Accessory fitting exceeds the geometry limit",
        );
      for (const v of [polygon[0], polygon[i], polygon[i + 1]]) {
        names.forEach((_, k) =>
          output[k].push(...v.slice(offsets[k], offsets[k] + sizes[k])),
        );
        count++;
      }
      const group = groups.at(-1);
      if (group?.materialIndex === materialIndex) group.count += 3;
      else groups.push({ start: count - 3, count: 3, materialIndex });
    }
  };
  for (
    let i = 0;
    i < (index?.count ?? source.getAttribute("position").count);
    i += 3
  ) {
    const polygon = [0, 1, 2].map((j) => read(index?.getX(i + j) ?? i + j));
    const distances = polygon.map(coordinate);
    const materialIndex =
      source.groups.find((g) => i >= g.start && i < g.start + g.count)
        ?.materialIndex ?? 0;
    if (!distances.some((d) => d > 1e-7) || !distances.some((d) => d < -1e-7)) {
      emit(polygon, materialIndex);
      continue;
    }
    if (region) {
      const vertices = polygon.map((v) =>
        new THREE.Vector3(v[pos], v[pos + 1], v[pos + 2]).applyMatrix4(matrix),
      );
      const bounds = new THREE.Box3().setFromPoints(vertices);
      const boundary =
        region.center[region.axis] +
        region.radius[region.axis] * region.direction;
      if (
        (["x", "y", "z"] as const)
          .filter((a) => a !== region.axis)
          .some(
            (a) =>
              bounds.max[a] < region.center[a] - region.radius[a] - 1e-6 ||
              bounds.min[a] > region.center[a] + region.radius[a] + 1e-6,
          ) ||
        (region.direction < 0
          ? bounds.max[region.axis] <= boundary + 1e-6
          : bounds.min[region.axis] >= boundary - 1e-6)
      ) {
        emit(polygon, materialIndex);
        continue;
      }
    }
    for (const sign of [-1, 1]) {
      const clipped: number[][] = [];
      for (let j = 0; j < 3; j++) {
        const a = polygon[j],
          b = polygon[(j + 1) % 3],
          da = distances[j] * sign,
          db = distances[(j + 1) % 3] * sign;
        if (da >= 0) clipped.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          clipped.push(a.map((v, k) => v + (b[k] - v) * t));
        }
      }
      if (clipped.length >= 3) emit(clipped, materialIndex);
    }
  }
  const geometry = new THREE.BufferGeometry();
  names.forEach((name, i) =>
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(output[i], sizes[i]),
    ),
  );
  for (const group of groups)
    geometry.addGroup(group.start, group.count, group.materialIndex);
  mesh.geometry = geometry;
  source.dispose();
}

/** Project against the actual exported triangles, not an approximate head sphere.
 * A small XY spatial index bounds assembly cost; it is discarded after fitting.
 */
function projector(
  meshes: THREE.Mesh[],
  socket: THREE.Object3D,
  axis: "z" | "x" = "z",
  direction: -1 | 1 = 1,
) {
  const inverse = socket.matrixWorld.clone().invert();
  const cells = new Map<string, Triangle[]>();
  let entries = 0;
  const cell = (n: number) => Math.floor(n * 64);
  for (const mesh of meshes) {
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    const position = mesh.geometry.getAttribute("position");
    const indices = mesh.geometry.index;
    for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
      const t = [0, 1, 2].map((j) => {
        const p = new THREE.Vector3()
          .fromBufferAttribute(position, indices?.getX(i + j) ?? i + j)
          .applyMatrix4(matrix);
        return new THREE.Vector3(
          axis === "z" ? p.x : p.z,
          p.y,
          p[axis] * direction,
        );
      }) as Triangle;
      for (
        let x = cell(Math.min(...t.map((p) => p.x)) - 1e-6);
        x <= cell(Math.max(...t.map((p) => p.x)) + 1e-6);
        x++
      )
        for (
          let y = cell(Math.min(...t.map((p) => p.y)) - 1e-6);
          y <= cell(Math.max(...t.map((p) => p.y)) + 1e-6);
          y++
        ) {
          if (++entries > 250000)
            throw new AvatarError(
              "fit",
              "Head surface exceeds the projection complexity limit",
            );
          const key = `${x},${y}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key)!.push(t);
        }
    }
  }
  const project = (x: number, y: number): number | undefined => {
    let depth = -Infinity;
    for (const [a, b, c] of cells.get(`${cell(x)},${cell(y)}`) ?? []) {
      const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(det) < 1e-12) continue;
      const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / det;
      const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / det;
      if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001)
        depth = Math.max(depth, u * a.z + v * b.z + (1 - u - v) * c.z);
    }
    return Number.isFinite(depth) ? depth : undefined;
  };
  // The difference between two projected triangle planes is linear. Its
  // maximum lies at a vertex of their overlap polygon, including edge
  // intersections that an authored-vertex-only contact test would miss.
  let queries = 0;
  const work = () => {
    if (++queries > 250000)
      throw new AvatarError(
        "fit",
        "Head contact exceeds the projection complexity limit",
      );
  };
  const clearance = (triangle: Triangle): number | undefined => {
    if (triangle.some((p) => !p.toArray().every(Number.isFinite)))
      throw new AvatarError(
        "fit",
        "Accessory contact coordinates must be finite",
      );
    const candidates = new Set<Triangle>();
    for (
      let x = cell(Math.min(...triangle.map((p) => p.x)));
      x <= cell(Math.max(...triangle.map((p) => p.x)));
      x++
    )
      for (
        let y = cell(Math.min(...triangle.map((p) => p.y)));
        y <= cell(Math.max(...triangle.map((p) => p.y)));
        y++
      ) {
        work();
        for (const head of cells.get(`${x},${y}`) ?? []) candidates.add(head);
      }
    let maximum = -Infinity;
    for (const head of candidates) {
      work();
      const [a, b, c] = head,
        det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(det) < 1e-12) continue;
      const orientation = Math.sign(det);
      let polygon: THREE.Vector3[] = [...triangle];
      for (let i = 0; i < 3 && polygon.length; i++) {
        const a = head[i],
          b = head[(i + 1) % 3],
          distance = (p: THREE.Vector3) =>
            orientation *
            ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)),
          output: THREE.Vector3[] = [];
        for (let j = 0; j < polygon.length; j++) {
          const p = polygon[j],
            q = polygon[(j + 1) % polygon.length],
            dp = distance(p),
            dq = distance(q);
          if (dp >= -1e-10) output.push(p);
          if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0))
            output.push(p.clone().lerp(q, dp / (dp - dq)));
        }
        polygon = output;
      }
      for (const p of polygon) {
        const u = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / det,
          v = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / det;
        maximum = Math.max(
          maximum,
          u * a.z + v * b.z + (1 - u - v) * c.z - p.z,
        );
      }
    }
    return Number.isFinite(maximum) ? maximum : undefined;
  };
  return Object.assign(project, { clearance });
}

/** Resolve curved temple contact inside long side faces, not only at authored
 * vertices. Refinement is bounded and preserves every interpolated attribute.
 */
function refineSideSurface(
  mesh: THREE.Mesh,
  matrix: THREE.Matrix4,
  project: [ReturnType<typeof projector>, ReturnType<typeof projector>],
  offset: number,
  maxDistance: number,
  centerX: number,
  original: THREE.Vector3[],
) {
  const source = mesh.geometry,
    index = source.index,
    inverse = matrix.clone().invert(),
    names = Object.keys(source.attributes),
    sizes = names.map((name) => source.getAttribute(name).itemSize),
    starts = sizes.map((_, i) =>
      sizes.slice(0, i).reduce((sum, n) => sum + n, 0),
    ),
    position = starts[names.indexOf("position")],
    origin = sizes.reduce((sum, size) => sum + size, 0),
    output: number[][] = names.map(() => []),
    groups: { start: number; count: number; materialIndex: number }[] = [];
  let count = 0,
    changed = false;
  // Carry authoring-space provenance through every split. These private
  // coordinates are interpolated but never become exported GPU attributes.
  const read = (i: number) => [
    ...names.flatMap((name) => {
      const attribute = source.getAttribute(name);
      return Array.from({ length: attribute.itemSize }, (_, j) =>
        attribute.getComponent(i, j),
      );
    }),
    ...original[i].toArray(),
  ];
  const average = (points: number[][]) =>
    points[0].map(
      (_, i) =>
        points.reduce((sum, point) => sum + point[i], 0) / points.length,
    );
  const clear = (vertex: number[]) => {
    const p = new THREE.Vector3(
        ...(vertex.slice(position, position + 3) as [number, number, number]),
      ).applyMatrix4(matrix),
      sign = p.x < centerX ? -1 : 1,
      skin = project[sign < 0 ? 0 : 1](p.z, p.y);
    const distance = skin === undefined ? 0 : skin + offset - sign * p.x;
    if (distance <= 1e-7) return { vertex, moved: false, distance: 0 };
    // A sub-millimetre reserve prevents repeated refinement at an exported
    // head facet boundary merely to reproduce its edge to float precision.
    p.x += sign * (distance + 0.0002);
    if (
      p.distanceTo(
        new THREE.Vector3(
          ...(vertex.slice(origin, origin + 3) as [number, number, number]),
        ),
      ) > maxDistance
    )
      throw new AvatarError(
        "fit",
        "Accessory side exceeds its approved cumulative fitting distance",
      );
    p.applyMatrix4(inverse);
    const result = [...vertex];
    result.splice(position, 3, p.x, p.y, p.z);
    return { vertex: result, moved: true, distance };
  };
  const emit = (triangle: number[][], materialIndex: number, depth: number) => {
    const surfacePoints = triangle.map((vertex) =>
      new THREE.Vector3(
        ...(vertex.slice(position, position + 3) as [number, number, number]),
      ).applyMatrix4(matrix),
    );
    const sign = surfacePoints[0].x < centerX ? -1 : 1;
    if (surfacePoints.some((p) => (p.x - centerX) * sign < 0))
      throw new AvatarError(
        "fit",
        "Accessory side triangles must stay on one side of the head",
      );
    const contact = project[sign < 0 ? 0 : 1].clearance(
      surfacePoints.map(
        (p) => new THREE.Vector3(p.z, p.y, sign * p.x),
      ) as Triangle,
    );
    if (contact !== undefined && contact + offset > 0.0001) {
      const midpoints = [0, 1, 2].map((i) =>
          clear(average([triangle[i], triangle[(i + 1) % 3]])),
        ),
        center = clear(average(triangle));
      if (depth >= 14)
        throw new AvatarError(
          "fit",
          "Accessory sides cannot resolve the head surface within the refinement limit",
        );
      changed = true;
      if (midpoints.some((point) => point.moved) || !center.moved) {
        const projectedLength = (i: number) => {
          const points = [triangle[i], triangle[(i + 1) % 3]].map((v) =>
            new THREE.Vector3(
              ...(v.slice(position, position + 3) as [number, number, number]),
            ).applyMatrix4(matrix),
          );
          return (
            (points[0].y - points[1].y) ** 2 + (points[0].z - points[1].z) ** 2
          );
        };
        const i = [0, 1, 2].reduce(
          (best, index) =>
            projectedLength(index) > projectedLength(best) ? index : best,
          0,
        );
        emit(
          [triangle[i], midpoints[i].vertex, triangle[(i + 2) % 3]],
          materialIndex,
          depth + 1,
        );
        emit(
          [midpoints[i].vertex, triangle[(i + 1) % 3], triangle[(i + 2) % 3]],
          materialIndex,
          depth + 1,
        );
      } else {
        for (let i = 0; i < 3; i++)
          emit(
            [triangle[i], triangle[(i + 1) % 3], center.vertex],
            materialIndex,
            depth + 1,
          );
      }
      return;
    }
    if (count >= 60000)
      throw new AvatarError(
        "budget",
        "Accessory sides exceed the geometry limit",
      );
    for (const vertex of triangle)
      names.forEach((_, i) =>
        output[i].push(...vertex.slice(starts[i], starts[i] + sizes[i])),
      );
    const group = groups.at(-1);
    if (group?.materialIndex === materialIndex) group.count += 3;
    else groups.push({ start: count, count: 3, materialIndex });
    count += 3;
  };
  for (
    let i = 0;
    i < (index?.count ?? source.getAttribute("position").count);
    i += 3
  ) {
    const materialIndex =
      source.groups.find(
        (group) => i >= group.start && i < group.start + group.count,
      )?.materialIndex ?? 0;
    emit(
      [0, 1, 2].map((j) => read(index?.getX(i + j) ?? i + j)),
      materialIndex,
      0,
    );
  }
  if (!changed) return;
  const geometry = new THREE.BufferGeometry();
  names.forEach((name, i) =>
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(output[i], sizes[i]),
    ),
  );
  for (const group of groups)
    geometry.addGroup(group.start, group.count, group.materialIndex);
  mesh.geometry = geometry;
  source.dispose();
}

/** Head-local horizontal rays retain both front and profile paint. The Y index
 * bounds work to a narrow ring; no sphere approximation or head-name lookup. */
function radialProjector(meshes: THREE.Mesh[], socket: THREE.Object3D) {
  const cells = new Map<number, Triangle[]>(),
    inverse = socket.matrixWorld.clone().invert();
  let entries = 0;
  for (const mesh of meshes) {
    const matrix = inverse.clone().multiply(mesh.matrixWorld),
      p = mesh.geometry.getAttribute("position"),
      ix = mesh.geometry.index;
    for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
      const triangle = [0, 1, 2].map((j) =>
        new THREE.Vector3()
          .fromBufferAttribute(p, ix?.getX(i + j) ?? i + j)
          .applyMatrix4(matrix),
      ) as Triangle;
      const low = Math.floor(
          (Math.min(...triangle.map((v) => v.y)) - 1e-6) * 64,
        ),
        high = Math.floor((Math.max(...triangle.map((v) => v.y)) + 1e-6) * 64);
      for (let cell = low; cell <= high; cell++) {
        if (++entries > 250000)
          throw new AvatarError(
            "fit",
            "Head surface exceeds the projection complexity limit",
          );
        if (!cells.has(cell)) cells.set(cell, []);
        cells.get(cell)!.push(triangle);
      }
    }
  }
  const rings = new Map<
    number,
    { center: THREE.Vector3; segments: [THREE.Vector3, THREE.Vector3][] }
  >();
  return (point: THREE.Vector3, offset: number) => {
    if (!rings.has(point.y)) {
      const segments: [THREE.Vector3, THREE.Vector3][] = [],
        bounds = new THREE.Box3();
      for (const triangle of cells.get(Math.floor(point.y * 64)) ?? []) {
        const slice: THREE.Vector3[] = [];
        for (let i = 0; i < 3; i++) {
          const a = triangle[i],
            b = triangle[(i + 1) % 3],
            dy = b.y - a.y;
          if (Math.abs(dy) < 1e-10) {
            if (Math.abs(point.y - a.y) < 1e-7) slice.push(a, b);
          } else {
            const t = (point.y - a.y) / dy;
            if (t >= -1e-6 && t <= 1.000001)
              slice.push(a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1)));
          }
        }
        for (const v of slice) bounds.expandByPoint(v);
        for (let i = 0; i < slice.length; i++)
          for (let j = i + 1; j < slice.length; j++)
            segments.push([slice[i], slice[j]]);
      }
      if (!segments.length) return undefined;
      const center = bounds.getCenter(new THREE.Vector3());
      center.y = point.y;
      rings.set(point.y, { center, segments });
    }
    const { center, segments } = rings.get(point.y)!;
    const direction = point.clone().sub(center);
    direction.y = 0;
    direction.normalize();
    if (direction.lengthSq() < 0.5) return undefined;
    let radius = -Infinity;
    for (const [start, end] of segments) {
      const a = start.clone().sub(center),
        e = end.clone().sub(start),
        det = direction.x * e.z - direction.z * e.x;
      if (Math.abs(det) < 1e-12) continue;
      const t = (a.x * direction.z - a.z * direction.x) / det;
      if (t >= -1e-5 && t <= 1.00001)
        radius = Math.max(radius, (a.x * e.z - a.z * e.x) / det);
    }
    if (!Number.isFinite(radius) || radius <= 0) return undefined;
    return center.clone().addScaledVector(direction, radius + offset);
  };
}

/** Called only on instance-owned geometry, before an appearance commits. */
export function fitAssembly(
  root: THREE.Group,
  assets: Asset[],
  socket: THREE.Bone,
  maxTriangles: number,
) {
  root.updateMatrixWorld(true);
  const owned = new Map<string, THREE.Mesh[]>();
  const mutable = new Set(assets.filter((a) => a.fit).map((a) => a.id));
  for (const asset of assets)
    for (const volume of asset.hairFit ?? []) {
      if (volume.mode === "occlude") continue;
      const target = assets.find((a) => a.slot === volume.targetSlot);
      if (target) mutable.add(target.id);
    }
  const seenGeometry = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let parent: THREE.Object3D | null = object;
    while (parent && !parent.userData.assetId) parent = parent.parent;
    const id = parent?.userData.assetId;
    if (!id) return;
    // GLTF may instance one geometry at several transforms. Each fitted mesh
    // needs its own coordinates; a split must not dispose another mesh's data.
    if (mutable.has(id)) {
      if (seenGeometry.has(object.geometry))
        object.geometry = object.geometry.clone();
      seenGeometry.add(object.geometry);
    }
    if (!owned.has(id)) owned.set(id, []);
    owned.get(id)!.push(object);
  });
  const projections = new Map<string, ReturnType<typeof projector>>();
  const sideProjections = new Map<
    string,
    [ReturnType<typeof projector>, ReturnType<typeof projector>]
  >();
  const radialProjections = new Map<
    string,
    ReturnType<typeof radialProjector>
  >();
  const transforms = new Map<
    string,
    { sx: number; sy: number; x: number; y: number; z: number }
  >();
  for (const asset of assets) {
    if (!asset.fit) continue;
    const fit = asset.fit;
    const provider = assets.find((a) => a.slot === fit.targetSlot)!;
    if (fit.projection !== "radial" && !projections.has(provider.id))
      projections.set(
        provider.id,
        projector(owned.get(provider.id) ?? [], socket),
      );
    const project = projections.get(provider.id)!;
    if (fit.projection === "wrap" && !sideProjections.has(provider.id))
      sideProjections.set(provider.id, [
        projector(owned.get(provider.id) ?? [], socket, "x", -1),
        projector(owned.get(provider.id) ?? [], socket, "x", 1),
      ]);
    if (fit.projection === "radial" && !radialProjections.has(provider.id))
      radialProjections.set(
        provider.id,
        radialProjector(owned.get(provider.id) ?? [], socket),
      );
    const radial =
      fit.projection === "radial"
        ? radialProjections.get(provider.id)
        : undefined;
    const from = fit.frame,
      to = provider.surface!.frame;
    const vertices: {
      mesh: THREE.Mesh;
      index: number;
      local: THREE.Vector3;
      inverse: THREE.Matrix4;
      depth: number | undefined;
      target?: THREE.Vector3;
      role?: "front" | "side";
    }[] = [];
    let shift = -Infinity,
      hits = 0;
    const sideMeshes = new Set<THREE.Mesh>();
    const coordinates = new Map<THREE.Mesh, THREE.Vector3[]>();
    for (const mesh of owned.get(asset.id) ?? []) {
      coordinates.set(mesh, []);
      let role: "front" | "side" | undefined;
      if (fit.projection === "wrap") {
        let node: THREE.Object3D | null = mesh;
        while (node && !node.userData.fitRole && !node.userData.assetId)
          node = node.parent;
        if (!["front", "side"].includes(node?.userData.fitRole))
          throw new AvatarError(
            "fit",
            `${asset.label} needs explicit front and side fitting roles`,
          );
        role = node!.userData.fitRole;
        if (role === "side") sideMeshes.add(mesh);
      }
      const matrix = socket.matrixWorld
        .clone()
        .invert()
        .multiply(mesh.matrixWorld);
      const inverse = matrix.clone().invert();
      const position = mesh.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3()
          .fromBufferAttribute(position, i)
          .applyMatrix4(matrix);
        p.x = to[0] + ((p.x - from[0]) * to[2]) / from[2];
        p.y = to[1] + ((p.y - from[1]) * to[3]) / from[3];
        coordinates.get(mesh)!.push(p.clone());
        const target = radial?.(p, fit.offset);
        const depth = radial ? target?.z : project(p.x, p.y);
        if (depth !== undefined && role !== "side") {
          shift = Math.max(shift, depth + fit.offset - p.z);
          hits++;
        } else if (fit.mode === "surface") {
          throw new AvatarError(
            "fit",
            `${asset.label} extends beyond ${provider.label}'s fitting surface at ${p.toArray().join(",")}`,
          );
        }
        vertices.push({
          mesh,
          index: i,
          local: p,
          inverse,
          depth,
          target,
          role,
        });
      }
    }
    if (fit.mode === "clearance")
      for (const [mesh, points] of coordinates) {
        if (sideMeshes.has(mesh)) continue;
        const indices = mesh.geometry.index;
        for (let i = 0; i < (indices?.count ?? points.length); i += 3) {
          const triangle = [0, 1, 2].map(
            (j) => points[indices?.getX(i + j) ?? i + j],
          ) as Triangle;
          const contact = project.clearance(triangle);
          if (contact !== undefined) {
            shift = Math.max(shift, contact + fit.offset);
            hits++;
          }
        }
      }
    if (
      !hits ||
      (fit.mode === "clearance" && Math.abs(shift) > fit.maxDistance)
    )
      throw new AvatarError(
        "fit",
        `${asset.label} cannot reach ${provider.label}'s fitting surface`,
      );
    transforms.set(asset.id, {
      sx: to[2] / from[2],
      sy: to[3] / from[3],
      x: to[0] - (from[0] * to[2]) / from[2],
      y: to[1] - (from[1] * to[3]) / from[3],
      z: fit.mode === "clearance" ? shift : 0,
    });
    if (
      fit.projection === "wrap" &&
      !vertices.some((vertex) => vertex.role === "side")
    )
      throw new AvatarError(
        "fit",
        `${asset.label} needs explicit front and side fitting roles`,
      );
    for (const {
      mesh,
      index,
      local,
      inverse,
      depth,
      target,
      role,
    } of vertices) {
      const before = local.clone();
      const dz = fit.mode === "surface" ? depth! + fit.offset - local.z : shift;
      if ((target ? local.distanceTo(target) : Math.abs(dz)) > fit.maxDistance)
        throw new AvatarError(
          "fit",
          `${asset.label} exceeds its approved fitting distance`,
        );
      if (target) local.copy(target);
      else local.z += dz;
      if (role === "side") {
        const sign = local.x < to[0] ? -1 : 1;
        const surface = sideProjections
          .get(provider.id)!
          [sign < 0 ? 0 : 1](local.z, local.y);
        if (surface !== undefined)
          local.x = sign * Math.max(sign * local.x, surface + fit.sideOffset!);
        if (local.distanceTo(before) > fit.maxDistance)
          throw new AvatarError(
            "fit",
            `${asset.label} exceeds its approved fitting distance`,
          );
      }
      local.applyMatrix4(inverse);
      mesh.geometry
        .getAttribute("position")
        .setXYZ(index, local.x, local.y, local.z);
    }
    for (const mesh of owned.get(asset.id) ?? []) {
      if (sideMeshes.has(mesh))
        refineSideSurface(
          mesh,
          socket.matrixWorld.clone().invert().multiply(mesh.matrixWorld),
          sideProjections.get(provider.id)!,
          fit.sideOffset!,
          fit.maxDistance,
          to[0],
          coordinates.get(mesh)!,
        );
      mesh.geometry.getAttribute("position").needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  }
  // Natural occlusion is a rendering relationship, never a request to carve
  // the target mesh. Glasses arms can disappear inside hair without turning
  // their path into a hole. Only explicit geometric modes enter this solver.
  const volumes = assets
    .flatMap((asset) =>
      (asset.hairFit ?? [])
        .filter((volume) => volume.mode !== "occlude")
        .map((volume) => ({ asset, volume })),
    )
    .sort(
      (a, b) =>
        Number(a.volume.mode === "clearance") -
          Number(b.volume.mode === "clearance") ||
        a.asset.id.localeCompare(b.asset.id),
    );
  const changed = new Set<THREE.Mesh>();
  const clearances = volumes.filter((v) => v.volume.mode === "clearance");
  let preparedClearances = false;
  // A temple constraint can move a vertex into the front-frame region. Solve
  // clearances to a fixed point rather than relying on an author's field order.
  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    for (const { asset, volume } of pass ? clearances : volumes) {
      if (volume.mode === "clearance" && !preparedClearances) {
        // Partition the complete clearance arrangement AFTER crown compression
        // and BEFORE moving any clearance vertices. Splitting after each push
        // creates fresh, unprojected vertices on every pass and can falsely
        // report a conflict even when all constraints are jointly satisfiable.
        const planes = new Map<THREE.Mesh, Set<string>>();
        for (const entry of clearances) {
          const t = transforms.get(entry.asset.id) ?? {
            sx: 1,
            sy: 1,
            x: 0,
            y: 0,
            z: 0,
          };
          const c = new THREE.Vector3(
            entry.volume.center[0] * t.sx + t.x,
            entry.volume.center[1] * t.sy + t.y,
            entry.volume.center[2] + t.z,
          );
          const r = new THREE.Vector3(
            entry.volume.radii[0] * t.sx,
            entry.volume.radii[1] * t.sy,
            entry.volume.radii[2],
          );
          const target = assets.find(
            (part) => part.slot === entry.volume.targetSlot,
          );
          for (const mesh of owned.get(target?.id ?? "") ?? []) {
            if (!planes.has(mesh)) planes.set(mesh, new Set());
            const matrix = socket.matrixWorld
              .clone()
              .invert()
              .multiply(mesh.matrixWorld);
            for (const axis of (["x", "y", "z"] as const).filter(
              (a) => a !== (entry.volume.axis ?? "z"),
            ))
              for (const sign of [-1, 1]) {
                const value = c[axis] + r[axis] * sign,
                  key = `${axis}:${value.toFixed(9)}`;
                if (!planes.get(mesh)!.has(key)) {
                  splitBoundary(mesh, matrix, axis, value);
                  planes.get(mesh)!.add(key);
                }
              }
          }
        }
        preparedClearances = true;
      }
      const target = assets.find((part) => part.slot === volume.targetSlot);
      if (!target) continue;
      if (
        target.skin ||
        target.attachments.length !== 1 ||
        target.attachments[0].socket !== "head"
      )
        throw new AvatarError(
          "fit",
          "Accessory volumes require a rigid head-mounted target",
        );
      const transform = transforms.get(asset.id) ?? {
        sx: 1,
        sy: 1,
        x: 0,
        y: 0,
        z: 0,
      };
      const center = new THREE.Vector3(...volume.center);
      center.set(
        center.x * transform.sx + transform.x,
        center.y * transform.sy + transform.y,
        center.z + transform.z,
      );
      const radius = new THREE.Vector3(...volume.radii).multiply(
        new THREE.Vector3(transform.sx, transform.sy, 1),
      );
      for (const mesh of owned.get(target.id) ?? []) {
        const matrix = socket.matrixWorld
          .clone()
          .invert()
          .multiply(mesh.matrixWorld);
        const inverse = matrix.clone().invert();
        if (volume.mode === "contain")
          splitBoundary(
            mesh,
            matrix,
            "y",
            volume.transition![1] * transform.sy + transform.y,
          );
        const position = mesh.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(position, i)
            .applyMatrix4(matrix);
          const before = p.clone();
          if (volume.mode === "contain") {
            const [start, end] = volume.transition!.map(
              (y) => y * transform.sy + transform.y,
            );
            const blend = THREE.MathUtils.smoothstep(p.y, start, end);
            const relative = p.clone().sub(center);
            const distance = relative.clone().divide(radius).length();
            if (distance > 1 && blend > 0)
              p.lerp(relative.multiplyScalar(1 / distance).add(center), blend);
          } else {
            const axis = volume.axis ?? "z",
              direction = volume.direction ?? -1;
            const boundary = center[axis] + radius[axis] * direction;
            if (
              (["x", "y", "z"] as const)
                .filter((a) => a !== axis)
                .every((a) => Math.abs(p[a] - center[a]) <= radius[a] + 1e-6) &&
              (p[axis] - boundary) * direction < 0
            )
              p[axis] = boundary;
          }
          if (p.distanceToSquared(before) > 1e-12) moved = true;
          p.applyMatrix4(inverse);
          position.setXYZ(i, p.x, p.y, p.z);
        }
        changed.add(mesh);
      }
    }
    if (!clearances.length || (pass > 0 && !moved)) break;
    if (pass === 4 && moved)
      throw new AvatarError("fit", "Accessory clearance volumes conflict");
  }
  // Vertex projection alone cannot guarantee triangle clearance: a long edge
  // can bridge the corner where two constraints meet. Finish with the exact
  // accessory-owned clearance solid, partitioning and removing only its interior.
  // This is a normal geometry stage for every hair mesh, not a per-style variant.
  for (const { asset, volume } of clearances) {
    const target = assets.find((part) => part.slot === volume.targetSlot);
    const t = transforms.get(asset.id) ?? { sx: 1, sy: 1, x: 0, y: 0, z: 0 };
    const center = new THREE.Vector3(
      volume.center[0] * t.sx + t.x,
      volume.center[1] * t.sy + t.y,
      volume.center[2] + t.z,
    );
    const radius = new THREE.Vector3(
      volume.radii[0] * t.sx,
      volume.radii[1] * t.sy,
      volume.radii[2],
    );
    for (const mesh of owned.get(target?.id ?? "") ?? []) {
      const matrix = socket.matrixWorld
        .clone()
        .invert()
        .multiply(mesh.matrixWorld);
      for (const axis of ["x", "y", "z"] as const)
        for (const sign of [-1, 1])
          splitBoundary(
            mesh,
            matrix,
            axis,
            center[axis] + radius[axis] * sign,
            {
              center,
              radius,
              axis: volume.axis ?? "z",
              direction: volume.direction ?? -1,
            },
          );
      const geometry = mesh.geometry,
        position = geometry.getAttribute("position");
      const keep: number[] = [],
        groups: { start: number; count: number; materialIndex: number }[] = [];
      for (let i = 0; i < position.count; i += 3) {
        const middle = new THREE.Vector3();
        for (let j = 0; j < 3; j++)
          middle.add(
            new THREE.Vector3()
              .fromBufferAttribute(position, i + j)
              .applyMatrix4(matrix),
          );
        middle.multiplyScalar(1 / 3);
        if (
          (["x", "y", "z"] as const).every(
            (axis) =>
              Math.abs(middle[axis] - center[axis]) < radius[axis] - 1e-6,
          )
        )
          continue;
        const materialIndex =
          geometry.groups.find(
            (group) => i >= group.start && i < group.start + group.count,
          )?.materialIndex ?? 0;
        const group = groups.at(-1);
        if (group?.materialIndex === materialIndex) group.count += 3;
        else groups.push({ start: keep.length, count: 3, materialIndex });
        keep.push(i, i + 1, i + 2);
      }
      geometry.setIndex(keep);
      geometry.clearGroups();
      for (const group of groups)
        geometry.addGroup(group.start, group.count, group.materialIndex);
    }
  }
  for (const mesh of changed) {
    mesh.geometry.getAttribute("position").needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  let triangles = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh)
      triangles +=
        (object.geometry.index?.count ??
          object.geometry.getAttribute("position").count) / 3;
  });
  if (triangles > maxTriangles)
    throw new AvatarError(
      "budget",
      "Fitted appearance exceeds the catalog geometry budget",
    );
}
