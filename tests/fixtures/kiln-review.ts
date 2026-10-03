import * as THREE from "three";
import { AvatarLibrary, ComicStyle, type Catalog } from "../../src";

/** Real catalog GLBs, runtime fitting/skinning and shipping ComicStyle WebGL. */
export async function renderKilnReview(head = "head-scout", weight = 0) {
  const catalog: Catalog = await fetch("/capsule/catalog.json").then((r) =>
    r.json(),
  );
  const look = await fetch("/capsule/looks/kiln-workshop.shift.json").then(
    (r) => r.json(),
  );
  const library = new AvatarLibrary(
    catalog,
    new URL("/capsule/", location.href).href,
  );
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const width = 350,
    height = 540;
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const camera = new THREE.OrthographicCamera(
      -0.81,
      0.81,
      1.25,
      -1.25,
      0.01,
      20,
    ),
    scene = new THREE.Scene();
  const sheet = document.createElement("canvas");
  sheet.width = width * 5;
  sheet.height = height + 75;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#f1e5ce";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#47332c";
  ctx.font = "bold 26px Arial";
  ctx.fillText(
    `KILN WORKSHOP / ${head.toUpperCase()} / BUILD ${weight}`,
    22,
    34,
  );
  ctx.font = "14px Arial";
  ctx.fillText(
    "ACTUAL ASSEMBLED GLBs · SHIPPING COMICSTYLE WEBGL · FRONT / SIDE / BACK / RUN / WAVE",
    22,
    58,
  );
  const records = [];
  try {
    for (const [col, view] of [
      "front",
      "side",
      "back",
      "run",
      "wave",
    ].entries()) {
      const a = library.create(),
        style = new ComicStyle({ inkWidth: 1.45 });
      try {
        const recipe = structuredClone(look.appearance);
        recipe.parts.head = head;
        recipe.body = { weight };
        await a.setAppearance(recipe);
        scene.add(a.object);
        for (let frame = 0; frame <= 60; frame++)
          a.update(
            frame / 60,
            view === "run"
              ? { velocity: { x: 0, z: 5.4 } }
              : view === "wave"
                ? { emote: { id: "wave", elapsed: frame / 60 } }
                : { reducedMotion: true },
          );
        style.update(a.object.children[0], new THREE.Vector2(width, height));
        const yaw =
          view === "side"
            ? Math.PI / 2
            : view === "back"
              ? Math.PI
              : view === "run"
                ? Math.PI / 5
                : view === "wave"
                  ? -0.14
                  : 0;
        camera.position.set(5 * Math.sin(yaw), 1.33, 5 * Math.cos(yaw));
        camera.lookAt(0, 1.12, 0);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, col * width, 75);
        ctx.fillStyle = "#47332c";
        ctx.font = "bold 17px Arial";
        ctx.fillText(view.toUpperCase(), col * width + 20, 600);
        records.push({ head, weight, view, recipe, ...a.diagnostics() });
      } finally {
        style.clear();
        scene.remove(a.object);
        a.dispose();
      }
    }
    return { image: sheet.toDataURL("image/png"), records };
  } finally {
    renderer.dispose();
    library.dispose();
  }
}
