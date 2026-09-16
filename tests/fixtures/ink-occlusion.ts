import * as THREE from "three";
import { ComicStyle } from "../../src/comic";
export function inkOcclusion() {
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(128, 128);
  renderer.setClearColor("#ffffff");
  const target = new THREE.WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  camera.position.z = 5;
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 24, 16),
    new THREE.MeshBasicMaterial({ color: "#ffdd88" }),
  );
  scene.add(mesh);
  const ink = new ComicStyle({
    inkWidth: 3,
    inkColor: "#000000",
    pigment: 0,
    shadowStrength: 0,
  });
  ink.update(mesh, new THREE.Vector2(128, 128));
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: "#88bbcc" }),
  );
  wall.position.z = -1;
  scene.add(wall);
  const pixels = () => {
    renderer.render(scene, camera);
    const p = new Uint8Array(128 * 128 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 128, 128, p);
    return p;
  };
  const dark = (p: Uint8Array) => {
    let n = 0;
    for (let i = 0; i < p.length; i += 4)
      if (p[i] < 40 && p[i + 1] < 40 && p[i + 2] < 40) n++;
    return n;
  };
  const behind = dark(pixels());
  wall.position.z = 1;
  const inFront = dark(pixels());
  wall.position.z = -1;
  mesh.position.x = -0.7;
  pixels();
  mesh.position.x = 0.7;
  const moved = pixels();
  const repeated = pixels();
  const stable = moved.every((v, i) => v === repeated[i]);
  ink.clear();
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
  wall.geometry.dispose();
  wall.material.dispose();
  target.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return { behind, inFront, stable };
}
