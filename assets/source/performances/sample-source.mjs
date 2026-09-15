/** Evaluate original KayKit and Quaternius TRS curves in their untouched +Y-up, +Z-forward frame.
 * Source and CC0 provenance: README.md. No target retargeting occurs here.
 */
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const selectionURL = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]))
  : new URL("selection.json", import.meta.url);
const outputURL = process.argv[3]
  ? pathToFileURL(resolve(process.argv[3]))
  : new URL("source-samples.json", import.meta.url);
import * as THREE from "three";
const inputs = JSON.parse(fs.readFileSync(selectionURL));
const kaykit = {
  root: "root",
  pelvis: "hips",
  lowerSpine: "spine",
  midSpine: "spine",
  chest: "chest",
  neck: "head",
  head: "head",
  leftClavicle: "upperarm.l",
  leftUpperArm: "upperarm.l",
  leftForearm: "lowerarm.l",
  leftHand: "wrist.l",
  rightClavicle: "upperarm.r",
  rightUpperArm: "upperarm.r",
  rightForearm: "lowerarm.r",
  rightHand: "wrist.r",
  leftThigh: "upperleg.l",
  leftShin: "lowerleg.l",
  leftAnkle: "foot.l",
  leftToe: "toes.l",
  leftToeEnd: "toes.l",
  rightThigh: "upperleg.r",
  rightShin: "lowerleg.r",
  rightAnkle: "foot.r",
  rightToe: "toes.r",
  rightToeEnd: "toes.r",
  leftPalm: "hand.l",
  rightPalm: "hand.r",
};
const aliases = {
  midSpine: "lowerSpine",
  neck: "head",
  leftClavicle: "leftUpperArm",
  rightClavicle: "rightUpperArm",
  leftToeEnd: "leftToe",
  rightToeEnd: "rightToe",
};
const quaternius = {
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
  leftPalm: "middle_01_l",
  rightPalm: "middle_01_r",
};
const result = {
  schema: 1,
  frame:
    "Original GLB world frame: +Y up, +Z forward, anatomical left +X. No reflection or retargeting.",
  layout: {
    positions: "Flat xyz metres",
    rotations: "Flat normalized xyzw world quaternions",
    times: "Original sampler key times in seconds; authored endpoint preserved",
  },
  sources: {},
  clips: {},
};
const round = (array) => array.map((value) => +value.toFixed(8));
for (const [filename, selection] of Object.entries(inputs)) {
  const selected = selection.clips;
  const semantic = selection.rig === "kaykit" ? kaykit : quaternius;
  const bytes = fs.readFileSync(new URL(filename, selectionURL));
  const jsonLength = bytes.readUInt32LE(12),
    document = JSON.parse(bytes.subarray(20, 20 + jsonLength)),
    binary = bytes.subarray(28 + jsonLength);
  function values(index) {
    const accessor = document.accessors[index],
      view = document.bufferViews[accessor.bufferView];
    if (accessor.componentType !== 5126 || accessor.sparse)
      throw new Error("Expected dense float animation accessor");
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[
      accessor.type
    ];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
      stride = view.byteStride ?? width * 4;
    return Array.from({ length: accessor.count }, (_, i) =>
      Array.from({ length: width }, (_, j) =>
        binary.readFloatLE(offset + i * stride + j * 4),
      ),
    );
  }
  const objects = document.nodes.map((node) => {
    const object = new THREE.Object3D();
    object.name = node.name;
    return object;
  });
  document.nodes.forEach((node, index) =>
    (node.children ?? []).forEach((child) =>
      objects[index].add(objects[child]),
    ),
  );
  const roots = objects.filter((object) => !object.parent);
  function reset() {
    document.nodes.forEach((node, index) => {
      objects[index].position.fromArray(node.translation ?? [0, 0, 0]);
      objects[index].quaternion.fromArray(node.rotation ?? [0, 0, 0, 1]);
      objects[index].scale.fromArray(node.scale ?? [1, 1, 1]);
    });
    roots.forEach((object) => object.updateMatrixWorld(true));
  }
  const joints = Object.values(semantic).map((name) => {
    const object = objects.find((object) => object.name === name);
    if (!object) throw new Error(`Missing ${name}`);
    return object;
  });
  function snapshot() {
    return {
      positions: joints.flatMap((joint) =>
        round(joint.getWorldPosition(new THREE.Vector3()).toArray()),
      ),
      rotations: joints.flatMap((joint) =>
        round(
          joint
            .getWorldQuaternion(new THREE.Quaternion())
            .normalize()
            .toArray(),
        ),
      ),
    };
  }
  reset();
  result.sources[filename] = {
    rig: selection.rig,
    joints: Object.entries(semantic).map(([name, sourceName]) => ({
      name,
      sourceName,
      ...(selection.rig === "kaykit" && aliases[name]
        ? { aliasOf: aliases[name] }
        : {}),
    })),
    rest: snapshot(),
  };
  for (const name of selected) {
    reset();
    const animation = document.animations.find(
      (animation) => animation.name === name,
    );
    if (!animation) throw new Error(`Missing ${name}`);
    const samplers = animation.samplers.map((sampler) => ({
      ...sampler,
      times: values(sampler.input).flat(),
      values: values(sampler.output),
    }));
    const times = [
        ...new Set(samplers.flatMap((sampler) => sampler.times)),
      ].sort((a, b) => a - b),
      samples = [];
    for (const time of times) {
      for (const channel of animation.channels) {
        const sampler = samplers[channel.sampler];
        let index = sampler.times.findIndex((t) => t >= time);
        if (index < 0) index = sampler.times.length - 1;
        let out = sampler.values[index];
        if (index > 0 && sampler.times[index] !== time) {
          if ((sampler.interpolation ?? "LINEAR") !== "LINEAR")
            throw new Error("Unexpected non-linear sampler");
          const alpha =
            (time - sampler.times[index - 1]) /
            (sampler.times[index] - sampler.times[index - 1]);
          out =
            channel.target.path === "rotation"
              ? new THREE.Quaternion()
                  .fromArray(sampler.values[index - 1])
                  .slerp(new THREE.Quaternion().fromArray(out), alpha)
                  .toArray()
              : out.map(
                  (value, component) =>
                    sampler.values[index - 1][component] * (1 - alpha) +
                    value * alpha,
                );
        }
        const object = objects[channel.target.node];
        if (channel.target.path === "translation")
          object.position.fromArray(out);
        else if (channel.target.path === "rotation")
          object.quaternion.fromArray(out);
        else if (channel.target.path === "scale") object.scale.fromArray(out);
        else throw new Error("Unexpected animation path");
      }
      roots.forEach((object) => object.updateMatrixWorld(true));
      samples.push({ time: +time.toFixed(8), ...snapshot() });
    }
    result.clips[`${filename}:${name}`] = {
      source: filename,
      sourceClip: name,
      duration: +times.at(-1).toFixed(8),
      sampleRate: 30,
      samples,
    };
  }
}
fs.writeFileSync(outputURL, JSON.stringify(result) + "\n");
console.log(
  JSON.stringify({
    sources: Object.keys(result.sources),
    clips: Object.fromEntries(
      Object.entries(result.clips).map(([name, clip]) => [
        name,
        clip.samples.length,
      ]),
    ),
  }),
);
