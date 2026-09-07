import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";

/** Shipping assets and shader; camera orbit deliberately includes back and rear obliques. */
export async function renderFitQuality(accessories = false) {
  const catalog: Catalog = await fetch("/catalog.json").then((r) => r.json());
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
      -0.38,
      0.38,
      0.44,
      -0.44,
      0.01,
      10,
    ),
    scene = new THREE.Scene();
  const sheet = document.createElement("canvas");
  sheet.width = width * 8;
  sheet.height = height * 6 + 80;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#341e27";
  ctx.font = "bold 26px Arial";
  ctx.fillText(
    accessories
      ? "ZOOMAP · GLASSES OCCLUDED BY HAIR"
      : "ZOOMAP · SCALP COVERAGE / 360°",
    24,
    36,
  );
  const records = [];
  try {
    for (const [row, id] of [
      "hair-sweep",
      "hair-curls",
      "hair-pony",
      "hair-ember",
      "hair-tide",
      "hair-volt",
    ].entries()) {
      const avatar = library.create(),
        ink = new ComicStyle({ inkWidth: 1.45 });
      try {
        const recipe = defaultRecipe(catalog);
        recipe.parts.head = "head-spark";
        recipe.parts.hair = id;
        recipe.body = { weight: row % 2 ? -1 : 1 };
        Object.assign(recipe.colors, {
          hair:
            id === "hair-tide"
              ? "#20323d"
              : id === "hair-volt"
                ? "#baa078"
                : "#514030",
          skin: "#c08a64",
        });
        if (accessories) recipe.parts.eyewear = "acc-glasses";
        await avatar.setAppearance(recipe);
        scene.add(avatar.object);
        ink.update(avatar.object.children[0], new THREE.Vector2(width, height));
        for (let col = 0; col < 8; col++) {
          const yaw = (col * Math.PI) / 4;
          camera.position.set(4 * Math.sin(yaw), 1.92, 4 * Math.cos(yaw));
          camera.lookAt(0, 1.82, 0);
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          ctx.drawImage(renderer.domElement, col * width, 60 + row * height);
          ctx.fillStyle = "#341e27";
          ctx.font = "14px Arial";
          ctx.fillText(
            `${id.replace("hair-", "")} / ${col * 45}°`,
            col * width + 10,
            60 + row * height + height - 8,
          );
        }
        records.push({ id, accessories, ...avatar.diagnostics() });
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
