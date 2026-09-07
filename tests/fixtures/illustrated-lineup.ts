import * as THREE from "three";
import { AvatarLibrary } from "../../src/runtime";
import { defaultRecipe, validateCatalog, type Recipe } from "../../src/core";
import { ComicStyle } from "../../src/comic";

/** Presentation-only evidence: every character pixel comes from the live WebGL runtime. */
export async function renderIllustratedLineup() {
  const catalog = await fetch("/catalog.json").then((response) =>
    response.json(),
  );
  validateCatalog(catalog);
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(512, 768);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -0.82,
    0.82,
    1.23,
    -1.23,
    0.05,
    20,
  );
  camera.position.set(0, 1.15, 5);
  camera.lookAt(0, 1.025, 0);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.39, 64),
    new THREE.MeshBasicMaterial({
      color: "#4b473a",
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);
  const panel = document.createElement("canvas");
  panel.width = 1664;
  panel.height = 1090;
  const context = panel.getContext("2d")!;
  context.fillStyle = "#f7f2e8";
  context.fillRect(0, 0, panel.width, panel.height);
  context.fillStyle = "#4c2028";
  context.font = "700 43px Georgia";
  context.fillText("ZOOMAP / ILLUSTRATED CHARACTERS", 60, 72);
  context.fillStyle = "#706854";
  context.font = "18px Arial";
  context.fillText(
    "Modular pieces · drawn facial expressions · connected clothing",
    62,
    107,
  );
  context.strokeStyle = "#cfc7b6";
  context.beginPath();
  context.moveTo(60, 133);
  context.lineTo(1604, 133);
  context.stroke();
  const looks = [
    {
      title: "COURT CAPTAIN",
      view: "Front / white jersey",
      pose: "idle",
      rotation: -0.07,
      parts: {
        head: "head-scout",
        face: "face-focus",
        hair: "hair-sweep",
        shirt: "shirt-jersey",
        bottom: "bottom-court",
        shoes: "shoes-court",
      },
      colors: {
        skin: "#cf925a",
        primary: "#f7efdf",
        secondary: "#2c2b28",
        trim: "#32312a",
        hair: "#342b22",
        accent: "#bf8533",
      },
    },
    {
      title: "AFTER THE MATCH",
      view: "Side / maroon track",
      pose: "idle",
      rotation: 1.22,
      parts: {
        head: "head-spark",
        face: "face-grin",
        hair: "hair-pony",
        shirt: "shirt-track",
        bottom: "bottom-training",
        shoes: "shoes-high",
      },
      colors: {
        skin: "#dea267",
        primary: "#7d3040",
        secondary: "#302c2b",
        trim: "#f4ead7",
        hair: "#d6a14a",
        accent: "#a77236",
      },
    },
    {
      title: "GOOD COMPANY",
      view: "Wave / amber hoodie",
      pose: "wave",
      rotation: -0.1,
      parts: {
        head: "head-scout",
        face: "face-wink",
        hair: "hair-curls",
        shirt: "shirt-hoodie",
        bottom: "bottom-court",
        shoes: "shoes-runner",
      },
      colors: {
        skin: "#975c38",
        primary: "#eda137",
        secondary: "#2d2b28",
        trim: "#f4ead7",
        hair: "#252522",
        accent: "#d9a342",
      },
    },
  ] as const;
  const evidence = [];
  try {
    for (let i = 0; i < looks.length; i++) {
      const look = looks[i],
        avatar = library.create();
      const recipe: Recipe = defaultRecipe(catalog);
      Object.assign(recipe.parts, look.parts);
      Object.assign(recipe.colors, look.colors);
      const style = new ComicStyle({ inkWidth: 1.1 });
      try {
        await avatar.setAppearance(recipe);
        scene.add(avatar.object);
        avatar.update(1.25, { gesture: look.pose, reducedMotion: true });
        avatar.object.rotation.y = look.rotation;
        style.update(avatar.object.children[0], new THREE.Vector2(512, 768));
        renderer.render(scene, camera);
        const x = 40 + i * 536;
        context.drawImage(renderer.domElement, x, 158);
        context.fillStyle = "#897b60";
        context.font = "14px Arial";
        context.fillText(`0${i + 1}`, x + 28, 179);
        context.fillStyle = "#4c2028";
        context.font = "700 22px Arial";
        context.fillText(look.title, x + 28, 966);
        context.fillStyle = "#746955";
        context.font = "18px Georgia";
        context.fillText(look.view, x + 28, 996);
        evidence.push({
          title: look.title,
          pose: look.pose,
          yaw: look.rotation,
          recipe,
          ...avatar.diagnostics(),
        });
      } finally {
        style.dispose();
        scene.remove(avatar.object);
        avatar.dispose();
      }
    }
    context.strokeStyle = "#cfc7b6";
    context.beginPath();
    context.moveTo(60, 1033);
    context.lineTo(1604, 1033);
    context.stroke();
    context.fillStyle = "#817762";
    context.font = "15px Arial";
    context.fillText(
      "Actual WebGL renders from the current modular kit. No illustration retouching.",
      62,
      1065,
    );
    context.textAlign = "right";
    context.fillText(`Catalog ${catalog.revision}`, 1602, 1065);
    return { image: panel.toDataURL("image/png"), evidence };
  } finally {
    shadow.geometry.dispose();
    (shadow.material as THREE.Material).dispose();
    library.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
