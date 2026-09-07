import * as THREE from "three";
import { bakeDirectionalAtlas } from "../../src/directional";

function pixel(pixels: Uint8Array, width: number, x: number, y: number) {
  const start = (y * width + x) * 4;
  return Array.from(pixels.slice(start, start + 4));
}

/** Actual GPU comparison, including intentionally bypassed tone mapping and a released source bitmap. */
export async function verifyDirectionalColors() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(256, 256);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(),
    root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.1);
  const materials = [false, true].map(
    (toneMapped) =>
      new THREE.MeshBasicMaterial({ color: "#c68b60", toneMapped }),
  );
  const centers = [-0.45, 0.45];
  materials.forEach((material, index) => {
    const patch = new THREE.Mesh(geometry, material);
    patch.position.x = centers[index];
    root.add(patch);
  });
  scene.add(root);
  const bounds = new THREE.Box3().setFromObject(root, true);
  const size = bounds.getSize(new THREE.Vector3());
  const half = (Math.hypot(size.x, size.z) / 2) * 1.08;
  const camera = new THREE.OrthographicCamera(
    -half,
    half,
    half,
    -half,
    0.01,
    10,
  );
  camera.position.z = 4;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  const gl = renderer.getContext(),
    live = new Uint8Array(256 * 256 * 4);
  gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, live);
  const atlas = await bakeDirectionalAtlas(renderer, root, {
    tileSize: 256,
    elevation: 0,
  });
  const baked = atlas.readPixels();
  const colors = centers.map((center, index) => {
    const x = Math.round((center / half + 1) * 128);
    return {
      toneMapped: materials[index].toneMapped,
      live: pixel(live, 256, x, 128),
      baked: pixel(baked, 1024, x, 768 + 128),
    };
  });
  atlas.dispose();
  scene.remove(root);
  geometry.dispose();
  materials.forEach((material) => material.dispose());

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 4;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#538b76";
  context.fillRect(0, 0, 4, 4);
  const image = await createImageBitmap(canvas);
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const mappedGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const mappedMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  });
  const mapped = new THREE.Mesh(mappedGeometry, mappedMaterial);
  let closedAt = 0;
  texture.addEventListener("dispose", () => image.close());
  const imageAtlas = await bakeDirectionalAtlas(renderer, mapped, {
    tileSize: 64,
    elevation: 0,
    onProgress: (done) => {
      if (done === 1) {
        texture.dispose();
        mappedMaterial.dispose();
        mappedGeometry.dispose();
        closedAt = done;
      }
    },
  });
  const imagePixels = imageAtlas.readPixels();
  const bitmapColors = imageAtlas.metadata.frames.map((frame) =>
    pixel(imagePixels, 256, frame.rect.x + 32, 256 - frame.rect.y - 64 + 32),
  );
  const imageClosed = image.width === 0;
  imageAtlas.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return { colors, imageClosed, closedAt, bitmapColors };
}
