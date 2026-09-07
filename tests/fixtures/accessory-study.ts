import * as THREE from "three";
import {
  AvatarLibrary,
  defaultRecipe,
  selectedAssets,
  ComicStyle,
} from "../../src";

/** Untouched runtime renders, composed into a labeled comparison sheet. */
export async function renderAccessoryStudy() {
  const catalog = await fetch("/catalog.json").then((r) => r.json());
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const avatar = library.create();
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(360, 400);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -0.44,
    0.44,
    0.49,
    -0.49,
    0.01,
    10,
  );
  camera.position.set(0, 1.7, 5);
  camera.lookAt(0, 1.7, 0);
  const style = new ComicStyle({ inkWidth: 0.85 });
  const panel = document.createElement("canvas");
  panel.width = 1520;
  panel.height = 1510;
  const ctx = panel.getContext("2d")!;
  ctx.fillStyle = "#f7f2e8";
  ctx.fillRect(0, 0, panel.width, panel.height);
  ctx.fillStyle = "#512434";
  ctx.font = "700 36px Georgia";
  ctx.fillText("ZOOMAP / MADE TO FIT TOGETHER", 44, 58);
  ctx.fillStyle = "#72644f";
  ctx.font = "17px Arial";
  ctx.fillText(
    "One mustache. One pair of glasses. One cap. Three hairstyles. Two different head shapes.",
    45,
    90,
  );
  const rows = [
    {
      head: "head-scout",
      face: "face-focus",
      hair: "hair-sweep",
      name: "SCOUT / SIDE SWEEP",
      skin: "#cf925a",
      hairColor: "#342b22",
      primary: "#782e43",
    },
    {
      head: "head-spark",
      face: "face-grin",
      hair: "hair-curls",
      name: "SPARK / CLOUD CURLS",
      skin: "#855538",
      hairColor: "#232222",
      primary: "#d29339",
    },
    {
      head: "head-spark",
      face: "face-wink",
      hair: "hair-pony",
      name: "SPARK / HIGH PONY",
      skin: "#edc39d",
      hairColor: "#9a602e",
      primary: "#496d65",
    },
  ];
  const metadata: any[] = [];
  try {
    scene.add(avatar.object);
    for (let row = 0; row < rows.length; row++) {
      const item = rows[row],
        recipe = defaultRecipe(catalog);
      Object.assign(recipe.parts, {
        head: item.head,
        face: item.face,
        hair: item.hair,
        facialHair: "facial-mustache",
        eyewear: "acc-glasses",
        headwear: "hat-club-cap",
      });
      Object.assign(recipe.colors, {
        skin: item.skin,
        hair: item.hairColor,
        primary: item.primary,
        secondary: "#282c2b",
        trim: "#f4ead7",
      });
      const y = 130 + row * 450;
      ctx.fillStyle = "#512434";
      ctx.font = "700 18px Arial";
      ctx.fillText(item.name, 45, y);
      for (let col = 0; col < 4; col++) {
        const views = [
          { yaw: 0, label: "FRONT" },
          { yaw: 45, label: "THREE-QUARTER" },
          { yaw: 90, label: "PROFILE" },
          { yaw: 180, label: "REAR / HAIR EXIT" },
        ];
        await avatar.setAppearance(recipe);
        avatar.update(0, { gesture: "idle", reducedMotion: true });
        avatar.object.rotation.y = THREE.MathUtils.degToRad(views[col].yaw);
        style.update(avatar.object.children[0], new THREE.Vector2(360, 400));
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, 30 + col * 375, y + 5);
        ctx.font = "13px Arial";
        ctx.fillStyle = "#72644f";
        ctx.fillText(views[col].label, 48 + col * 375, y + 415);
      }
      metadata.push({
        recipe,
        assets: selectedAssets(recipe, catalog).map((a) => ({
          id: a.id,
          url: a.url,
          sha256: a.sha256,
        })),
      });
    }
    ctx.font = "14px Arial";
    ctx.fillStyle = "#72644f";
    ctx.fillText(
      "Actual orthographic WebGL captures · Public avatar runtime · Authored Blender assets · No image retouching",
      45,
      1490,
    );
    return { image: panel.toDataURL("image/png"), metadata };
  } finally {
    style.dispose();
    avatar.dispose();
    library.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
