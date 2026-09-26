import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";

/** Actual fitted GLBs; reference pictures never enter the render path. */
export async function renderPlaytimeStudy(motion = false) {
  const catalog: Catalog = await fetch("/catalog.json").then((r) => r.json());
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const w = 360,
    h = 480;
  renderer.setSize(w, h);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  const canvas = document.createElement("canvas");
  canvas.width = w * 5;
  canvas.height = 530 * 3;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const metadata = [];
  try {
    for (const [row, id] of [
      "FROG DAYS",
      "BOLT MODE",
      "GO PLAYTIME",
    ].entries()) {
      for (let col = 0; col < 5; col++) {
        const avatar = library.create(),
          style = new ComicStyle({ inkWidth: 1.6 });
        try {
          const recipe = defaultRecipe(catalog);
          Object.assign(recipe.parts, {
            hair:
              col === 3 ? "hair-halo" : col === 4 ? "hair-pony" : "hair-sweep",
            bottom: "bottom-courtside",
          });
          if (row !== 1) recipe.parts.headwear = "hat-frog-days";
          if (row !== 0) recipe.parts.eyewear = "acc-bolt-mode";
          if (row === 2) recipe.parts.shirt = "shirt-melon-club";
          recipe.body = { weight: col === 3 ? -1 : col === 4 ? 1 : 0 };
          Object.assign(recipe.colors, {
            primary: "#eee6d6",
            secondary: "#283539",
            hair: "#594333",
          });
          await avatar.setAppearance(recipe);
          scene.add(avatar.object);
          if (motion)
            for (const t of [0, 0.033, 0.066, 0.1, 0.133, 0.166, 0.2])
              avatar.update(t, { velocity: { x: 0, z: 5.4 }, grounded: true });
          const half = row < 2 ? 0.5 : 1.25,
            focus = row < 2 ? 1.98 : 1.16;
          const target = new THREE.Vector3(0, focus, 0);
          if (motion && row < 2) {
            avatar.object.updateMatrixWorld(true);
            avatar
              .attachmentView()!
              .sockets.get("head")!
              .getWorldPosition(target);
            target.y += 0.17;
          }
          camera.top = half;
          camera.bottom = -half;
          camera.left = (-half * w) / h;
          camera.right = (half * w) / h;
          camera.position.set(
            target.x + (col === 1 ? 5 : col > 2 ? 2 : 0),
            target.y,
            target.z + (col === 2 ? -5 : col === 1 ? 0 : 5),
          );
          camera.lookAt(target);
          camera.updateProjectionMatrix();
          style.update(avatar.object.children[0], new THREE.Vector2(w, h));
          renderer.render(scene, camera);
          ctx.drawImage(renderer.domElement, col * w, row * 530);
          ctx.fillStyle = "#341e27";
          ctx.font = "bold 16px Arial";
          ctx.fillText(
            `${id} / ${["FRONT", "SIDE", "BACK", "HALO / LEAN", "PONY / FULL"][col]}`,
            col * w + 12,
            row * 530 + 506,
          );
          metadata.push({
            id,
            col,
            weight: recipe.body.weight,
            ...avatar.diagnostics(),
          });
        } finally {
          style.clear();
          scene.remove(avatar.object);
          avatar.dispose();
        }
      }
    }
    return { image: canvas.toDataURL("image/png"), metadata };
  } finally {
    renderer.dispose();
    library.dispose();
  }
}
