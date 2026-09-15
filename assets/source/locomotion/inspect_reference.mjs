/** Inspect original glTF rest frames without loading any runtime avatar or Blender scene. */
import fs from "node:fs";
import * as THREE from "three";

const source = new URL("./quaternius-ual1-locomotion.glb", import.meta.url);
const bytes = fs.readFileSync(source);
const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
const objects = document.nodes.map((node) => {
  const object = new THREE.Object3D();
  object.name = node.name;
  object.position.fromArray(node.translation ?? [0, 0, 0]);
  object.quaternion.fromArray(node.rotation ?? [0, 0, 0, 1]);
  object.scale.fromArray(node.scale ?? [1, 1, 1]);
  return object;
});
document.nodes.forEach((node, index) =>
  (node.children ?? []).forEach((child) => objects[index].add(objects[child])),
);
objects
  .filter((object) => !object.parent)
  .forEach((object) => object.updateMatrixWorld(true));
const round = (array) => array.map((value) => +value.toFixed(9));
const data = {
  source: "quaternius-ual1-locomotion.glb",
  coordinates: {
    up: "+Y",
    forward: "+Z",
    left: "+X",
    quaternionOrder: "x,y,z,w",
  },
  notes:
    "Original source bind frames, not Zoomap target frames. Root local rotation -90deg X. Retarget via source and target world rest frames.",
  joints: document.skins[0].joints.map((index) => {
    const object = objects[index];
    return {
      name: object.name,
      node: index,
      parent: object.parent?.name,
      localPosition: round(object.position.toArray()),
      localQuaternion: round(object.quaternion.toArray()),
      localScale: round(object.scale.toArray()),
      worldPosition: round(
        object.getWorldPosition(new THREE.Vector3()).toArray(),
      ),
      worldQuaternion: round(
        object.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      ),
    };
  }),
};
fs.writeFileSync(
  new URL("./source-rest-frames.json", import.meta.url),
  `${JSON.stringify(data, null, 2)}\n`,
);
console.log(`Inspected ${data.joints.length} source rest frames`);
