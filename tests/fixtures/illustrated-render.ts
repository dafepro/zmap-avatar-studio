import * as THREE from "three";
import { ComicStyle } from "../../src/comic";

/** Real GPU proof for skinning chunks, stable surface paint and alpha preservation. */
export function renderIllustratedFixture() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(320, 320);
  renderer.setClearColor("#f4efe5");
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.8, 0.8, 0.8, -0.8, 0.1, 10);
  camera.position.set(0, 0, 3);
  const geometry = new THREE.CylinderGeometry(0.18, 0.18, 1, 16, 12);
  const positions = geometry.getAttribute("position");
  const indices = new Uint16Array(positions.count * 4),
    weights = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    const blend = THREE.MathUtils.clamp((positions.getY(i) + 0.1) / 0.45, 0, 1);
    indices[i * 4 + 1] = 1;
    weights[i * 4] = 1 - blend;
    weights[i * 4 + 1] = blend;
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(indices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(weights, 4),
  );
  const bottom = new THREE.Bone(),
    top = new THREE.Bone();
  bottom.add(top);
  const skin = new THREE.MeshStandardMaterial({ color: "#c68b60" });
  skin.name = "skin";
  const mesh = new THREE.SkinnedMesh(geometry, skin);
  mesh.add(bottom);
  mesh.bind(new THREE.Skeleton([bottom, top]));
  const root = new THREE.Group();
  root.add(mesh);
  scene.add(root);
  const style = new ComicStyle({ inkWidth: 1.2 });
  style.update(root, new THREE.Vector2(320, 320));
  const capture = () => {
    renderer.render(scene, camera);
    const context = renderer.getContext();
    const pixels = new Uint8Array(320 * 320 * 4);
    context.readPixels(
      0,
      0,
      320,
      320,
      context.RGBA,
      context.UNSIGNED_BYTE,
      pixels,
    );
    let sum = 0,
      inkPixels = 0;
    for (let i = 0; i < pixels.length; i++)
      sum = (sum + pixels[i] * (i + 1)) % 2147483647;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 90 && pixels[i + 1] < 90 && pixels[i + 2] < 90)
        inkPixels++;
    const sampleLeft = pixels[(160 * 320 + 140) * 4];
    const sampleRight = pixels[(160 * 320 + 180) * 4];
    return {
      sum,
      inkPixels,
      volumeContrast: Math.abs(sampleLeft - sampleRight),
      image: renderer.domElement.toDataURL(),
    };
  };
  const first = capture(),
    repeated = capture();
  top.rotation.z = 0.8;
  const bent = capture();
  const calls = renderer.info.render.calls;
  style.dispose();
  geometry.dispose();
  skin.dispose();
  mesh.skeleton.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return {
    first: first.sum,
    volumeContrast: first.volumeContrast,
    repeated: repeated.sum,
    bent: bent.sum,
    image: bent.image,
    calls,
    inkPixels: bent.inkPixels,
  };
}
