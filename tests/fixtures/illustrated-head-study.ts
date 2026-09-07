import * as THREE from "three";
import { AvatarLibrary } from "../../src/runtime";
import { defaultRecipe, validateCatalog } from "../../src/core";
import { ComicStyle } from "../../src/comic";

/** Exact orthographic angles expose the actual jaw/nose silhouette without perspective tricks. */
export async function renderIllustratedHeadStudy() {
  const catalog = await fetch("/catalog.json").then((response) =>
    response.json(),
  );
  validateCatalog(catalog);
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const avatar = library.create();
  const recipe = defaultRecipe(catalog);
  Object.assign(recipe.parts, {
    head: "head-scout",
    face: "face-focus",
    hair: "hair-sweep",
    shirt: "shirt-jersey",
    bottom: "bottom-court",
    shoes: "shoes-court",
  });
  Object.assign(recipe.colors, {
    skin: "#cf925a",
    primary: "#f7efdf",
    secondary: "#2c2b28",
    trim: "#32312a",
    hair: "#342b22",
    accent: "#bf8533",
  });
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(512, 640);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -0.38,
    0.38,
    0.475,
    -0.475,
    0.05,
    20,
  );
  camera.position.set(0, 1.625, 5);
  camera.lookAt(0, 1.625, 0);
  const style = new ComicStyle({ inkWidth: 1.15 });
  const panel = document.createElement("canvas");
  panel.width = 1664;
  panel.height = 950;
  const context = panel.getContext("2d")!;
  context.fillStyle = "#f7f2e8";
  context.fillRect(0, 0, panel.width, panel.height);
  context.fillStyle = "#4c2028";
  context.font = "700 42px Georgia";
  context.fillText("ZOOMAP / FACE & SILHOUETTE STUDY", 60, 71);
  context.fillStyle = "#766b57";
  context.font = "18px Arial";
  context.fillText(
    "The same assembled head, collar and drawn expression at three exact viewing angles",
    62,
    108,
  );
  context.strokeStyle = "#cfc7b6";
  context.beginPath();
  context.moveTo(60, 133);
  context.lineTo(1604, 133);
  context.stroke();
  const views = [
    { name: "FRONT", degrees: 0 },
    { name: "EXACT PROFILE", degrees: 90 },
    { name: "THREE-QUARTER", degrees: 45 },
  ];
  try {
    await avatar.setAppearance(recipe);
    scene.add(avatar.object);
    avatar.update(0, { gesture: "idle", reducedMotion: true });
    style.update(avatar.object.children[0], new THREE.Vector2(512, 640));
    for (let i = 0; i < views.length; i++) {
      avatar.object.rotation.y = THREE.MathUtils.degToRad(views[i].degrees);
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 40 + i * 536, 150);
      context.fillStyle = "#4c2028";
      context.font = "700 21px Arial";
      context.fillText(views[i].name, 66 + i * 536, 839);
      context.fillStyle = "#81745d";
      context.font = "18px Georgia";
      context.fillText(
        `Orthographic · ${views[i].degrees}° yaw · level camera`,
        66 + i * 536,
        870,
      );
    }
    context.strokeStyle = "#cfc7b6";
    context.beginPath();
    context.moveTo(60, 900);
    context.lineTo(1604, 900);
    context.stroke();
    context.fillStyle = "#817762";
    context.font = "15px Arial";
    context.fillText(
      "Actual WebGL captures. The profile is shown without camera tilt or perspective distortion.",
      62,
      929,
    );
    return {
      image: panel.toDataURL("image/png"),
      metadata: {
        catalogRevision: catalog.revision,
        views,
        recipe,
        camera: { projection: "orthographic", targetY: 1.625, pitch: 0 },
        assets: catalog.assets
          .filter((asset: { id: string }) =>
            [catalog.base, ...Object.values(recipe.parts)].includes(asset.id),
          )
          .map((asset: { id: string; sha256: string }) => ({
            id: asset.id,
            sha256: asset.sha256,
          })),
      },
    };
  } finally {
    style.dispose();
    scene.remove(avatar.object);
    avatar.dispose();
    library.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
