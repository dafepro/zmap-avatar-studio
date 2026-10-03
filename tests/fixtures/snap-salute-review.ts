/** Shipping WebGL renderer, actual exported assets, seeked runtime emote. */
import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";
export async function renderSnapSaluteReview() {
  const catalog: Catalog = await fetch("/capsule/catalog.json").then((r) =>
    r.json(),
  );
  const library = new AvatarLibrary(
    catalog,
    new URL("/capsule/", location.href).href,
  );
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(1600, 1000);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor("#ece9df", 1);
  const sheet = document.createElement("canvas");
  sheet.width = 1600;
  sheet.height = 1140;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#ece9df";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#202c36";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("SNAP SALUTE · ACTUAL RUNTIME", 38, 52);
  ctx.font = "18px sans-serif";
  ctx.fillText(
    "Original 2.4s emote · exported GLBs · shipping ComicStyle/WebGL · no finger animation",
    40,
    82,
  );
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#fff7e3", "#687388", 2));
  const light = new THREE.DirectionalLight("#fff2d0", 3);
  light.position.set(-3, 5, 5);
  scene.add(light);
  const camera = new THREE.OrthographicCamera(
    -1.02,
    1.02,
    1.275,
    -1.275,
    0.1,
    20,
  );
  camera.position.set(0.1, 1.4, 6);
  camera.lookAt(0, 1.15, 0);
  const comic = new ComicStyle({
    inkWidth: 1.6,
    shadowStrength: 0.78,
    pigment: 0.1,
  });
  const samples = [];
  const cols = 4,
    rows = 2,
    w = 400,
    h = 500;
  const cases = [
    ["READY", 0, 0, "head-scout", "shirt-relay"],
    ["LIFT", 0.28, 0, "head-scout", "shirt-relay"],
    ["SALUTE", 0.72, 0, "head-scout", "shirt-relay"],
    ["NOD", 1.02, 0, "head-scout", "shirt-relay"],
    ["FLICK", 1.34, 0, "head-scout", "shirt-relay"],
    ["RESET", 2.4, 0, "head-scout", "shirt-relay"],
    ["LEAN / JACKET", 0.72, -1, "head-scout", "shirt-circuit"],
    ["FULL / JACKET", 0.72, 1, "head-spark", "shirt-circuit"],
  ] as const;
  for (let i = 0; i < cases.length; i++) {
    const [label, elapsed, weight, head, shirt] = cases[i],
      avatar = library.create();
    const recipe = defaultRecipe(catalog);
    Object.assign(recipe.parts, {
      head,
      shirt,
      hair: "hair-volt",
      face: "face-grin",
    });
    recipe.body = { weight };
    Object.assign(recipe.colors, {
      primary: "#dc6849",
      secondary: "#273646",
      trim: "#f1dfb8",
      accent: "#cad959",
      hair: "#486469",
      skin: "#cb9472",
    });
    await avatar.setAppearance(recipe);
    scene.add(avatar.object);
    for (let frame = 0; frame <= Math.ceil(elapsed * 60); frame++) {
      const t = Math.min(frame / 60, elapsed);
      avatar.update(t, { emote: { id: "snap-salute", elapsed: t } });
    }
    comic.update(avatar.object.children[0], new THREE.Vector2(w, h));
    renderer.setSize(w, h);
    renderer.render(scene, camera);
    const x = (i % cols) * w,
      y = Math.floor(i / cols) * h + 105;
    ctx.drawImage(renderer.domElement, x, y);
    ctx.fillStyle = "#202c36";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(label, x + 20, y + 28);
    ctx.font = "14px sans-serif";
    ctx.fillText(`${elapsed.toFixed(2)} s · build ${weight}`, x + 20, y + 49);
    samples.push({
      label,
      elapsed,
      weight,
      recipe,
      geometry: avatar.diagnostics(),
      emote: avatar.animationDiagnostics().emote ?? null,
    });
    scene.remove(avatar.object);
    comic.clear();
    avatar.dispose();
  }
  const image = sheet.toDataURL("image/png");
  comic.dispose();
  renderer.dispose();
  library.dispose();
  return { image, samples };
}
