import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  type Catalog,
  type Recipe,
} from "../../src";
/** Shipping GLBs loaded through AvatarLibrary and rendered with ComicStyle.
 * Not a concept or Blender render. Every cell is a deterministic runtime pose. */
export async function renderMoonwakeReview() {
  const catalog: Catalog = await fetch("/capsule/catalog.json").then((r) =>
    r.json(),
  );
  const look = await fetch("/capsule/looks/moonwake-festival.shift.json").then(
    (r) => r.json(),
  );
  const lib = new AvatarLibrary(
    catalog,
    new URL("/capsule/", location.href).href,
  );
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const width = 310,
    height = 405;
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-0.9, 0.9, 1.176, -1.176, 0.01, 10);
  const views = [
    { name: "FRONT", yaw: 0, pose: "idle" },
    { name: "SIDE", yaw: 90, pose: "idle" },
    { name: "BACK", yaw: 180, pose: "idle" },
    { name: "RUN", yaw: 65, pose: "run" },
    { name: "WAVE", yaw: 20, pose: "wave" },
  ] as const;
  const sheet = document.createElement("canvas");
  sheet.width = width * views.length;
  sheet.height = height * 6 + 86;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#eae8f0";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#23283f";
  ctx.font = "bold 27px Arial";
  ctx.fillText("MOONWAKE FESTIVAL · ACTUAL WEBGL / COMICSTYLE", 24, 36);
  ctx.font = "17px Arial";
  ctx.fillText(
    "Five independent pieces · both heads · three builds · front / side / back / run / wave",
    24,
    63,
  );
  const records = [];
  let row = 0;
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const avatar = lib.create(),
          ink = new ComicStyle({ inkWidth: 1.45 });
        try {
          const recipe: Recipe = structuredClone(look.appearance);
          recipe.parts.head = head;
          recipe.body = { weight };
          await avatar.setAppearance(recipe);
          scene.add(avatar.object);
          for (const [col, view] of views.entries()) {
            for (let frame = 0; frame <= 45; frame++)
              avatar.update(
                frame / 60,
                view.pose === "wave"
                  ? { emote: { id: "wave", elapsed: frame / 60 } }
                  : view.pose === "run"
                    ? { gesture: "run" }
                    : { reducedMotion: true },
              );
            const radians = (view.yaw * Math.PI) / 180;
            camera.position.set(
              Math.sin(radians) * 5,
              1.35,
              Math.cos(radians) * 5,
            );
            camera.lookAt(0, 1.11, 0);
            camera.updateProjectionMatrix();
            ink.update(
              avatar.object.children[0],
              new THREE.Vector2(width, height),
            );
            renderer.render(scene, camera);
            ctx.drawImage(renderer.domElement, col * width, 86 + row * height);
            ctx.fillStyle = "#23283f";
            ctx.font = "bold 14px Arial";
            ctx.fillText(
              `${head.replace("head-", "")} / build ${weight} / ${view.name}`,
              col * width + 10,
              86 + (row + 1) * height - 10,
            );
            records.push({
              head,
              weight,
              view: view.name,
              pose: view.pose,
              elapsed: 0.75,
              ...avatar.diagnostics(),
            });
          }
        } finally {
          ink.dispose();
          scene.remove(avatar.object);
          avatar.dispose();
        }
        row++;
      }
    return { image: sheet.toDataURL("image/png"), records };
  } finally {
    renderer.dispose();
    lib.dispose();
  }
}
