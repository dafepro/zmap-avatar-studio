import * as THREE from "three";
import { AvatarLibrary, ComicStyle, type Catalog } from "../../src";
/** Actual shipping AvatarLibrary + ComicStyle; no concept pixels or Blender renders. */
export async function renderTideglassReview(optional = false) {
  const catalog: Catalog = await fetch("/capsule/catalog.json").then((r) =>
    r.json(),
  );
  const manifestURL = new URL(
    "/capsule/sets/tideglass-explorer.json",
    location.href,
  );
  const manifest = await fetch(manifestURL).then((r) => r.json());
  const look = await fetch(new URL(manifest.look, manifestURL)).then((r) =>
    r.json(),
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
  const width = 300,
    height = 420;
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const camera = new THREE.OrthographicCamera(
      -0.79,
      0.79,
      1.106,
      -1.106,
      0.01,
      20,
    ),
    scene = new THREE.Scene();
  const sheet = document.createElement("canvas");
  sheet.width = width * 5;
  sheet.height = height * 6 + 80;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#e7f2f3";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#173747";
  ctx.font = "bold 26px Arial";
  ctx.fillText(
    `TIDEGLASS EXPLORER · ACTUAL COMICSTYLE GLBs${optional ? " · FULL OPTIONAL STACK" : ""}`,
    20,
    35,
  );
  const records = [];
  let row = 0;
  try {
    for (const head of ["head-scout", "head-spark"])
      for (const weight of [-1, 0, 1]) {
        const avatar = library.create(),
          ink = new ComicStyle({ inkWidth: 1.45 });
        try {
          const recipe = structuredClone(look.appearance);
          recipe.parts.head = head;
          recipe.body = { weight };
          if (optional)
            Object.assign(recipe.parts, {
              hair: "hair-volt",
              facialHair: "facial-mustache",
              eyewear: "acc-glasses",
              effect: "effect-orbit",
            });
          await avatar.setAppearance(recipe);
          scene.add(avatar.object);
          for (const [col, label, yaw, pose] of [
            [0, "front", 0, "idle"],
            [1, "side", 90, "idle"],
            [2, "back", 180, "idle"],
            [3, "run", 25, "run"],
            [4, "wave", -20, "wave"],
          ] as const) {
            for (let i = 0; i <= 60; i++)
              avatar.update(
                i / 60,
                pose === "run"
                  ? { velocity: { x: 0, z: 5.4 } }
                  : pose === "wave"
                    ? { emote: { id: "wave", elapsed: i / 60 } }
                    : {},
              );
            ink.update(
              avatar.object.children[0],
              new THREE.Vector2(width, height),
            );
            const radians = (yaw * Math.PI) / 180;
            camera.position.set(
              5 * Math.sin(radians),
              1.28,
              5 * Math.cos(radians),
            );
            camera.lookAt(0, 1.075, 0);
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
            ctx.drawImage(renderer.domElement, col * width, 60 + row * height);
            ctx.fillStyle = "#173747";
            ctx.font = "16px Arial";
            ctx.fillText(
              `${head.replace("head-", "")} / ${weight > 0 ? "+" : ""}${weight} / ${label}`,
              col * width + 12,
              60 + row * height + height - 8,
            );
            records.push({
              head,
              weight,
              label,
              pose,
              optional,
              recipe,
              ...avatar.diagnostics(),
            });
          }
        } finally {
          ink.clear();
          ink.dispose();
          scene.remove(avatar.object);
          avatar.dispose();
        }
        row++;
      }
  } finally {
    renderer.dispose();
    library.dispose();
  }
  return { image: sheet.toDataURL("image/png"), records };
}
