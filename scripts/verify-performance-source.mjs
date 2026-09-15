/** Independent GLTFLoader/AnimationMixer comparison against the TRS sampler. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const directory = new URL("../assets/source/performances/", import.meta.url);
const samplesBytes = await fs.readFile(
  new URL("source-samples.json", directory),
);
const samples = JSON.parse(samplesBytes);
const selection = JSON.parse(
  await fs.readFile(new URL("selection.json", directory)),
);
const report = {
  schema: 1,
  method:
    "Independent Three GLTFLoader/AnimationMixer evaluation at every original selected key. Materials are replaced only in the in-memory verification document so Node does not need image decoding. Bone, animation, and geometry buffers are unchanged.",
  samplesSha256: createHash("sha256").update(samplesBytes).digest("hex"),
  clips: {},
};
for (const [filename, selected] of Object.entries(selection)) {
  const raw = await fs.readFile(new URL(filename, directory));
  const length = raw.readUInt32LE(12);
  const document = JSON.parse(raw.subarray(20, 20 + length));
  const binary = raw.subarray(28 + length);
  delete document.images;
  delete document.textures;
  document.materials = [{}];
  for (const mesh of document.meshes)
    for (const primitive of mesh.primitives) primitive.material = 0;
  let json = Buffer.from(JSON.stringify(document));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const output = Buffer.alloc(28 + json.length + binary.length);
  output.write("glTF", 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.write("JSON", 16);
  json.copy(output, 20);
  output.writeUInt32LE(binary.length, 20 + json.length);
  output.write("BIN\0", 24 + json.length);
  binary.copy(output, 28 + json.length);
  const gltf = await new GLTFLoader().parseAsync(output.buffer, "");
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const nodes = new Map();
  for (const [object, association] of gltf.parser.associations)
    if (object instanceof THREE.Object3D && association.nodes !== undefined)
      nodes.set(gltf.parser.json.nodes[association.nodes].name, object);
  const joints = samples.sources[filename].joints;
  for (const name of selected.clips) {
    const source = samples.clips[`${filename}:${name}`];
    mixer.stopAllAction();
    const action = mixer.clipAction(
      gltf.animations.find((clip) => clip.name === name),
    );
    action.reset().setLoop(THREE.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    let positionError = 0,
      rotationError = 0;
    for (const frame of source.samples) {
      action.enabled = true;
      action.paused = false;
      action.time = frame.time;
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      joints.forEach((joint, index) => {
        const node = nodes.get(joint.sourceName);
        if (!node) throw Error(`Missing ${filename}:${joint.sourceName}`);
        positionError = Math.max(
          positionError,
          node
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(
              new THREE.Vector3().fromArray(frame.positions, index * 3),
            ),
        );
        rotationError = Math.max(
          rotationError,
          node
            .getWorldQuaternion(new THREE.Quaternion())
            .normalize()
            .angleTo(
              new THREE.Quaternion()
                .fromArray(frame.rotations, index * 4)
                .normalize(),
            ),
        );
      });
    }
    if (positionError > 0.00001 || rotationError > 0.00001)
      throw Error(
        `${filename}:${name} source disagreement: ${positionError}m / ${rotationError}rad`,
      );
    report.clips[`${filename}:${name}`] = {
      samples: source.samples.length,
      maxPositionErrorMetres: positionError,
      maxRotationErrorRadians: rotationError,
    };
  }
  gltf.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        material.dispose();
    }
  });
}
await fs.writeFile(
  new URL("verification.json", directory),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    clips: Object.keys(report.clips).length,
    samples: Object.values(report.clips).reduce(
      (total, clip) => total + clip.samples,
      0,
    ),
    maxPositionErrorMetres: Math.max(
      ...Object.values(report.clips).map((clip) => clip.maxPositionErrorMetres),
    ),
    maxRotationErrorRadians: Math.max(
      ...Object.values(report.clips).map(
        (clip) => clip.maxRotationErrorRadians,
      ),
    ),
  }),
);
