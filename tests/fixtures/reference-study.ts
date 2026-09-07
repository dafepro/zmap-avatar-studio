import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";

/** Reproducible browser render of the actual exported GLBs, never a concept image. */
export async function renderReferenceStudy(weightOnly = false) {
  const catalog: Catalog = await fetch("/catalog.json").then((r) => r.json());
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const width = weightOnly ? 480 : 440,
    height = weightOnly ? 900 : 570;
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -0.9,
    0.9,
    1.166,
    -1.166,
    0.01,
    20,
  );
  const canvas = document.createElement("canvas");
  canvas.width = weightOnly ? 1536 : 1800;
  canvas.height = weightOnly ? 1024 : 1990;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!weightOnly) {
    ctx.fillStyle = "#341e27";
    ctx.font = "bold 36px Georgia";
    ctx.fillText("ZOOMAP / REFERENCE COMPONENT KIT", 38, 51);
    ctx.font = "17px Arial";
    ctx.fillStyle = "#786f62";
    ctx.fillText(
      "Actual browser geometry · independent parts · one weight cage · one accessory source per style",
      40,
      84,
    );
  }
  const specs = weightOnly
    ? [
        { label: "LEAN", view: "avatar", yaw: 20, weight: -1 },
        { label: "STUDY", view: "avatar", yaw: 20, weight: 0 },
        { label: "HEAVIER", view: "avatar", yaw: 20, weight: 1 },
      ]
    : [
        { label: "BASE / FRONT", view: "base", yaw: 0, weight: 0 },
        { label: "BASE / PROFILE", view: "base", yaw: 90, weight: 0 },
        { label: "STUDY / FRONT", view: "avatar", yaw: 0, weight: 0 },
        { label: "STUDY / PROFILE", view: "avatar", yaw: 90, weight: 0 },
        { label: "HAIR / FRONT", view: "hair", yaw: 0, weight: 0 },
        { label: "HAIR / PROFILE", view: "hair", yaw: 90, weight: 0 },
        {
          label: "HAIR / ELEVATED TOP",
          view: "hair",
          yaw: 0,
          weight: 0,
          top: true,
        },
        {
          label: "OUTFIT / ELEVATED",
          view: "outfit",
          yaw: 30,
          weight: 0,
          top: true,
        },
        { label: "LEAN / SAME OUTFIT", view: "avatar", yaw: 20, weight: -1 },
        { label: "FULL / SAME OUTFIT", view: "avatar", yaw: 20, weight: 1 },
        {
          label: "CAP + GLASSES + MUSTACHE",
          view: "avatar",
          yaw: 20,
          weight: 0,
          accessories: true,
        },
        {
          label: "ACCESSORIES / PROFILE",
          view: "avatar",
          yaw: 90,
          weight: 1,
          accessories: true,
        },
      ];
  const metadata = [];
  try {
    for (const [index, spec] of specs.entries()) {
      const avatar = library.create(),
        style = new ComicStyle({ inkWidth: 1.6 });
      try {
        const recipe = defaultRecipe(catalog);
        recipe.parts.hair = "hair-sweep";
        recipe.body = { weight: spec.weight };
        recipe.colors = {
          skin: spec.view === "base" ? "#bcb9b5" : "#d3a17a",
          primary: "#f4f1eb",
          secondary: "#292b2d",
          trim: "#f5f2eb",
          hair: "#594333",
        };
        if (spec.accessories)
          Object.assign(recipe.parts, {
            headwear: "hat-club-cap",
            eyewear: "acc-glasses",
            facialHair: "facial-mustache",
          });
        const started = performance.now();
        await avatar.setAppearance(recipe);
        const assemblyMs = performance.now() - started;
        scene.add(avatar.object);
        avatar.object.rotation.y = THREE.MathUtils.degToRad(spec.yaw);
        const slots =
          spec.view === "base"
            ? ["body", "head", "face"]
            : spec.view === "hair"
              ? ["head", "face", "hair"]
              : spec.view === "outfit"
                ? ["shirt", "bottom", "shoes"]
                : null;
        avatar.object.traverse((o) => {
          if (o.userData.assetId)
            o.visible =
              !slots ||
              slots.includes(
                catalog.assets.find((a) => a.id === o.userData.assetId)!.slot,
              );
          if (
            spec.view === "base" &&
            o instanceof THREE.Mesh &&
            o.userData.avatarRegion
          )
            o.visible = true;
        });
        const focus = spec.view === "hair" ? 1.85 : 1.075,
          half = spec.view === "hair" ? 0.4 : weightOnly ? 1.12 : 1.16;
        camera.top = half;
        camera.bottom = -half;
        camera.left = (-half * width) / height;
        camera.right = (half * width) / height;
        camera.position.set(0, focus + (spec.top ? 4 : 0), spec.top ? 2.4 : 5);
        camera.lookAt(0, focus, 0);
        camera.updateProjectionMatrix();
        style.update(
          avatar.object.children[0],
          new THREE.Vector2(width, height),
        );
        renderer.render(scene, camera);
        const x = weightOnly ? 16 + index * 512 : 20 + (index % 4) * 445,
          y = weightOnly ? 14 : 120 + Math.floor(index / 4) * 615;
        ctx.drawImage(renderer.domElement, x, y);
        ctx.fillStyle = "#341e27";
        ctx.font = weightOnly ? "bold 30px Arial" : "bold 15px Arial";
        ctx.textAlign = weightOnly ? "center" : "left";
        ctx.fillText(
          spec.label,
          x + (weightOnly ? 240 : 12),
          y + (weightOnly ? 940 : 589),
        );
        metadata.push({
          label: spec.label,
          recipe,
          assemblyMs,
          ...avatar.diagnostics(),
        });
      } finally {
        style.clear();
        scene.remove(avatar.object);
        avatar.dispose();
      }
    }
    if (weightOnly) {
      ctx.textAlign = "center";
      ctx.font = "16px Arial";
      ctx.fillStyle = "#786f62";
      ctx.fillText(
        "ACTUAL RUNTIME · SAME JOINT CENTERS · LIMB VOLUME ABOUT ITS OWN AXIS",
        768,
        1006,
      );
    }
    return { image: canvas.toDataURL("image/png"), metadata };
  } finally {
    renderer.dispose();
    library.dispose();
  }
}
