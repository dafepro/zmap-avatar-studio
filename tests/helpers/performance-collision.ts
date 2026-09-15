import * as THREE from "three";

/** Count real triangle crossings through the trunk/legs. The Y limit excludes
 * intentional hand-grip contact; arm reach and equipment ownership are tested
 * separately. No undeformed authoring-space boxes stand in for the body. */
export function itemBodyCrossings(
  avatar: THREE.Object3D,
  item: THREE.Object3D,
  chestY: number,
) {
  avatar.updateMatrixWorld(true);
  const skin: THREE.Mesh[] = [];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const vertex = new THREE.Vector3();
  avatar.traverse((node) => {
    if (
      !(node instanceof THREE.SkinnedMesh) ||
      node.userData.comicOutline ||
      node.userData.handSide
    )
      return;
    let owner: THREE.Object3D | null = node;
    while (owner && !owner.userData.assetId) owner = owner.parent;
    if (!String(owner?.userData.assetId).startsWith("body-")) return;
    // Evaluate skinning once per pose instead of once per triangle ray. This is
    // still the actual posed surface, including anatomy hidden by clothing.
    const positions = new Float32Array(
      node.geometry.attributes.position.count * 3,
    );
    for (let i = 0; i < positions.length / 3; i++)
      node
        .getVertexPosition(i, vertex)
        .applyMatrix4(node.matrixWorld)
        .toArray(positions, i * 3);
    const geometry = new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    if (node.geometry.index) geometry.setIndex(node.geometry.index.clone());
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    skin.push(new THREE.Mesh(geometry, material));
  });
  let count = 0;
  const points: number[][] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    direction = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  item.traverse((mesh) => {
    if (!(mesh instanceof THREE.Mesh) || mesh.userData.comicOutline) return;
    const position = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    const vertices = Array.from({ length: position.count }, (_, i) =>
      mesh
        .getVertexPosition(i, new THREE.Vector3())
        .applyMatrix4(mesh.matrixWorld),
    );
    for (let i = 0; i < (index?.count ?? position.count); i += 3)
      for (let edge = 0; edge < 3; edge++) {
        a.copy(vertices[index?.getX(i + edge) ?? i + edge]);
        b.copy(
          vertices[index?.getX(i + ((edge + 1) % 3)) ?? i + ((edge + 1) % 3)],
        );
        if (Math.min(a.y, b.y) > chestY - 0.03) continue;
        direction.copy(b).sub(a);
        const length = direction.length();
        if (length < 0.001) continue;
        ray.set(a, direction.normalize());
        ray.near = 0.001;
        ray.far = length - 0.001;
        const hit = ray
          .intersectObjects(skin, false)
          .find((hit) => hit.point.y < chestY - 0.03);
        if (hit) {
          count++;
          if (points.length < 5) points.push(hit.point.toArray());
        }
      }
  });
  for (const mesh of skin) mesh.geometry.dispose();
  material.dispose();
  return { count, points };
}
