import * as THREE from "three";
import type { Asset } from "../../src/core";
/** An unseen procedural silhouette, without cap tags or fitted alternatives. */
export async function syntheticHair(
  shape: "wide" | "tall",
  rig: string,
): Promise<{ asset: Asset; bytes: Uint8Array<ArrayBuffer> }> {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const position = geo.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    position.setXYZ(
      i,
      x * (shape === "wide" ? 0.62 : 0.28),
      0.18 + y * (shape === "wide" ? 0.3 : 0.65),
      z * 0.43,
    );
  }
  const data = new Uint8Array(new Float32Array(position.array).buffer);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "hair-probe__head", children: [1] }, { mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [
      {
        name: "hair",
        pbrMetallicRoughness: {
          baseColorFactor: [0.08, 0.04, 0.02, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      },
    ],
    buffers: [{ byteLength: data.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: data.length }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: position.count,
        type: "VEC3",
        min: [-0.7, -0.5, -0.5],
        max: [0.7, 0.9, 0.5],
      },
    ],
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(28 + length + data.length),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + length);
  bytes.set(encoded, 20);
  view.setUint32(20 + length, data.length, true);
  view.setUint32(24 + length, 0x004e4942, true);
  bytes.set(data, 28 + length);
  const asset: Asset = {
    id: "hair-probe",
    label: "Unseen silhouette",
    description: "Adversarial fitting fixture",
    slot: "hair",
    rig,
    url: "models/hair-probe.glb",
    bytes: bytes.length,
    sha256: Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (n) => n.toString(16).padStart(2, "0"),
    ).join(""),
    triangles: position.count / 3,
    attachments: [{ node: "hair-probe__head", socket: "head" }],
    channels: ["hair"],
    tags: [],
  };
  geo.dispose();
  return { asset, bytes };
}
