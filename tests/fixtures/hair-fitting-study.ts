import * as THREE from "three";
import { AvatarLibrary, ComicStyle, defaultRecipe } from "../../src";
import { syntheticHair } from "../helpers/procedural-hair";

export async function renderHairFittingStudy() {
  const original = await fetch("/catalog.json").then((r) => r.json());
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(360, 420);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const panel = document.createElement("canvas");
  panel.width = 1520;
  panel.height = 1130;
  const ctx = panel.getContext("2d")!;
  ctx.fillStyle = "#f7f2e8";
  ctx.fillRect(0, 0, 1520, 1130);
  ctx.fillStyle = "#512434";
  ctx.font = "700 34px Georgia";
  ctx.fillText("ZOOMAP / UNSEEN HAIR STRESS TEST", 44, 55);
  ctx.fillStyle = "#72644f";
  ctx.font = "16px Arial";
  ctx.fillText(
    "Oversized procedural meshes. The same source file before and after accessory-owned fitting.",
    45,
    86,
  );
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-0.75, 0.75, 0.875, -0.875, 0.01, 10);
  camera.position.set(0, 1.74, 5);
  camera.lookAt(0, 1.74, 0);
  const metadata = [];
  try {
    for (const [row, shape] of (["wide", "tall"] as const).entries()) {
      const { asset, bytes } = await syntheticHair(shape, original.rig.id),
        catalog = structuredClone(original);
      catalog.assets.push(asset);
      const requests: string[] = [];
      const library = new AvatarLibrary(
        catalog,
        new URL("/", location.href).href,
        async (input, init) => {
          requests.push(String(input));
          return String(input).includes("hair-probe")
            ? new Response(bytes)
            : fetch(input, init);
        },
      );
      const avatar = library.create(),
        style = new ComicStyle({ inkWidth: 0.8 });
      const recipe = defaultRecipe(catalog);
      recipe.parts.hair = asset.id;
      Object.assign(recipe.colors, {
        hair: "#312821",
        primary: "#782e43",
        skin: "#cf925a",
      });
      scene.add(avatar.object);
      try {
        const y = 125 + row * 490;
        ctx.font = "700 18px Arial";
        ctx.fillStyle = "#512434";
        ctx.fillText(
          shape === "wide"
            ? "WIDE / 1.24 M SILHOUETTE"
            : "TALL / 1.30 M SILHOUETTE",
          45,
          y,
        );
        for (let col = 0; col < 4; col++) {
          if (col)
            Object.assign(recipe.parts, {
              headwear: "hat-club-cap",
              eyewear: "acc-glasses",
              facialHair: "facial-mustache",
            });
          await avatar.setAppearance(recipe);
          avatar.object.rotation.y = THREE.MathUtils.degToRad(
            [0, 0, 90, 180][col],
          );
          avatar.update(0, { reducedMotion: true });
          style.update(avatar.object.children[0], new THREE.Vector2(360, 420));
          renderer.render(scene, camera);
          ctx.drawImage(renderer.domElement, 30 + col * 375, y + 10);
          ctx.font = "14px Arial";
          ctx.fillStyle = "#72644f";
          ctx.fillText(
            ["ORIGINAL MESH", "AUTOMATIC FIT / FRONT", "PROFILE", "REAR"][col],
            48 + col * 375,
            y + 443,
          );
        }
        metadata.push({
          shape,
          sha256: asset.sha256,
          hairDownloads: requests.filter((p) => p.includes("hair-probe"))
            .length,
          triangles: avatar.diagnostics().triangles,
        });
      } finally {
        style.dispose();
        scene.remove(avatar.object);
        avatar.dispose();
        library.dispose();
      }
    }
    ctx.font = "14px Arial";
    ctx.fillText(
      "Geometry probes demonstrate fitting coverage; they are not proposed character designs. Actual WebGL captures.",
      45,
      1110,
    );
    return { image: panel.toDataURL("image/png"), metadata };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
