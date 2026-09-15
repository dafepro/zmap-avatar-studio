/** Evaluate untouched source animation TRS channels and record semantic world joint frames. */
import fs from "node:fs";
import * as THREE from "three";

const source = new URL("./quaternius-ual1-locomotion.glb", import.meta.url);
const bytes = fs.readFileSync(source);
const jsonLength = bytes.readUInt32LE(12);
const document = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const buffer = bytes.subarray(28 + jsonLength);
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function values(index) {
  const accessor = document.accessors[index];
  if (accessor.componentType !== 5126 || accessor.sparse)
    throw new Error("Expected dense Float32 animation");
  const view = document.bufferViews[accessor.bufferView];
  const width = components[accessor.type];
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? width * 4;
  return Array.from({ length: accessor.count }, (_, i) =>
    Array.from({ length: width }, (_, j) =>
      buffer.readFloatLE(offset + i * stride + j * 4),
    ),
  );
}
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
const roots = objects.filter((object) => !object.parent);
const update = () => roots.forEach((object) => object.updateMatrixWorld(true));
const semantic = {
  root: "root",
  pelvis: "pelvis",
  lowerSpine: "spine_01",
  midSpine: "spine_02",
  chest: "spine_03",
  neck: "neck_01",
  head: "Head",
  leftClavicle: "clavicle_l",
  leftUpperArm: "upperarm_l",
  leftForearm: "lowerarm_l",
  leftHand: "hand_l",
  rightClavicle: "clavicle_r",
  rightUpperArm: "upperarm_r",
  rightForearm: "lowerarm_r",
  rightHand: "hand_r",
  leftThigh: "thigh_l",
  leftShin: "calf_l",
  leftAnkle: "foot_l",
  leftToe: "ball_l",
  leftToeEnd: "ball_leaf_l",
  rightThigh: "thigh_r",
  rightShin: "calf_r",
  rightAnkle: "foot_r",
  rightToe: "ball_r",
  rightToeEnd: "ball_leaf_r",
};
const joints = Object.entries(semantic).map(([name, sourceName]) => ({
  name,
  sourceName,
  object: objects.find((o) => o.name === sourceName),
}));
const round = (array) => array.map((value) => +value.toFixed(7));
function snapshot() {
  return {
    positions: joints.flatMap((joint) =>
      round(joint.object.getWorldPosition(new THREE.Vector3()).toArray()),
    ),
    rotations: joints.flatMap((joint) =>
      round(joint.object.getWorldQuaternion(new THREE.Quaternion()).toArray()),
    ),
  };
}
update();
const result = {
  schema: 1,
  source: "quaternius-ual1-locomotion.glb",
  frame:
    "Source GLB world frame; Y up, +Z forward, left +X. Do not mirror the source silently.",
  layout: {
    positions: "Flat xyz in metres, one entry per joint in joints order",
    rotations:
      "Flat xyzw world quaternions, one entry per joint in joints order",
    times: "Seconds; last frame duplicates loop endpoint",
  },
  joints: joints.map(({ name, sourceName }) => ({ name, sourceName })),
  rest: snapshot(),
  clips: {},
};
for (const animation of document.animations) {
  const samplers = animation.samplers.map((sampler) => ({
    ...sampler,
    times: values(sampler.input).flat(),
    values: values(sampler.output),
  }));
  const times = [...new Set(samplers.flatMap((sampler) => sampler.times))].sort(
    (a, b) => a - b,
  );
  const samples = [];
  for (const time of times) {
    for (const channel of animation.channels) {
      const sampler = samplers[channel.sampler],
        width = sampler.values[0].length;
      let index = sampler.times.findIndex((t) => t >= time);
      if (index < 0) index = sampler.times.length - 1;
      let out = sampler.values[index];
      if (index > 0 && sampler.times[index] !== time) {
        if (sampler.interpolation !== "LINEAR")
          throw new Error("Expected linear sampler");
        const alpha =
          (time - sampler.times[index - 1]) /
          (sampler.times[index] - sampler.times[index - 1]);
        if (channel.target.path === "rotation")
          out = new THREE.Quaternion()
            .fromArray(sampler.values[index - 1])
            .slerp(new THREE.Quaternion().fromArray(out), alpha)
            .toArray();
        else
          out = Array.from(
            { length: width },
            (_, k) =>
              sampler.values[index - 1][k] * (1 - alpha) + out[k] * alpha,
          );
      }
      const object = objects[channel.target.node];
      if (channel.target.path === "translation") object.position.fromArray(out);
      else if (channel.target.path === "rotation")
        object.quaternion.fromArray(out);
      else if (channel.target.path === "scale") object.scale.fromArray(out);
      else throw new Error("Unsupported source track");
    }
    update();
    samples.push({ time: +time.toFixed(7), ...snapshot() });
  }
  result.clips[animation.name] = {
    duration: +times.at(-1).toFixed(7),
    sampleRate: 30,
    samples,
  };
}
fs.writeFileSync(
  new URL("./source-samples.json", import.meta.url),
  JSON.stringify(result) + "\n",
);
console.log(
  JSON.stringify({
    joints: result.joints.length,
    clips: Object.fromEntries(
      Object.entries(result.clips).map(([name, clip]) => [
        name,
        clip.samples.length,
      ]),
    ),
  }),
);
