import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";

/** Shipping assets and shader; camera orbit deliberately includes back and rear obliques. */
export async function renderFitQuality(
  accessories = false,
  selection?: string[],
  headwear = false,
) {
  const catalog: Catalog = await fetch("/catalog.json").then((r) => r.json());
  const hairstyles = catalog.assets.filter(
    (asset) =>
      asset.slot === "hair" && (!selection || selection.includes(asset.id)),
  );
  const hairColors: Record<string, string> = {
    "hair-tide": "#20323d",
    "hair-volt": "#baa078",
    "hair-nova": "#aa6031",
    "hair-halo": "#5b3e2e",
    "hair-reed": "#70513d",
  };
  const angles = Array.from({ length: 8 }, (_, index) => index * 45);
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const width = 260,
    height = 300;
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const camera = new THREE.OrthographicCamera(
      -0.525,
      0.525,
      0.606,
      -0.606,
      0.01,
      10,
    ),
    scene = new THREE.Scene();
  const sheet = document.createElement("canvas");
  sheet.width = width * angles.length;
  sheet.height = height * hairstyles.length + 80;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#341e27";
  ctx.font = "bold 26px Arial";
  ctx.fillText(
    headwear
      ? "ZOOMAP · HAIR 03 / CAP + GLASSES"
      : accessories
        ? "ZOOMAP · GLASSES OCCLUDED BY HAIR"
        : "ZOOMAP · SCALP COVERAGE / 360°",
    24,
    36,
  );
  const records = [];
  try {
    for (const [row, hair] of hairstyles.entries()) {
      const { id } = hair;
      const avatar = library.create(),
        ink = new ComicStyle({ inkWidth: 1.45 });
      try {
        const recipe = defaultRecipe(catalog);
        recipe.parts.head = "head-spark";
        recipe.parts.hair = id;
        recipe.body = { weight: row % 2 ? -1 : 1 };
        Object.assign(recipe.colors, {
          hair: hairColors[id] ?? "#514030",
          skin: "#c08a64",
        });
        if (accessories) recipe.parts.eyewear = "acc-glasses";
        if (headwear) recipe.parts.headwear = "hat-club-cap";
        await avatar.setAppearance(recipe);
        scene.add(avatar.object);
        ink.update(avatar.object.children[0], new THREE.Vector2(width, height));
        for (const [col, degrees] of angles.entries()) {
          const yaw = (degrees * Math.PI) / 180;
          camera.position.set(4 * Math.sin(yaw), 1.92, 4 * Math.cos(yaw));
          camera.lookAt(0, 1.82, 0);
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          ctx.drawImage(renderer.domElement, col * width, 60 + row * height);
          ctx.fillStyle = "#341e27";
          ctx.font = "14px Arial";
          ctx.fillText(
            `${id.replace("hair-", "")} / ${degrees}°`,
            col * width + 10,
            60 + row * height + height - 8,
          );
        }
        records.push({
          id,
          head: recipe.parts.head,
          weight: recipe.body.weight,
          hairColor: recipe.colors.hair,
          accessories,
          headwear,
          angles,
          ...avatar.diagnostics(),
        });
      } finally {
        ink.clear();
        scene.remove(avatar.object);
        avatar.dispose();
      }
    }
    return { image: sheet.toDataURL("image/png"), records };
  } finally {
    renderer.dispose();
    library.dispose();
  }
}
