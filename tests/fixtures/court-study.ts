import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";

export async function renderCourtStudy(motion = false) {
  const catalog: Catalog = await fetch("/catalog.json").then((r) => r.json());
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const w = 360,
    h = 520;
  renderer.setSize(w, h);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -0.82,
    0.82,
    1.185,
    -1.185,
    0.01,
    20,
  );
  const canvas = document.createElement("canvas");
  canvas.width = w * 5;
  canvas.height = 570 * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const metadata = [];
  try {
    for (const [row, id] of ["courtside", "matchday"].entries()) {
      for (let col = 0; col < 5; col++) {
        const avatar = library.create(),
          style = new ComicStyle({ inkWidth: 1.6 });
        try {
          const recipe = defaultRecipe(catalog);
          Object.assign(recipe.parts, {
            hair: "hair-sweep",
            shirt: `shirt-${id}`,
            bottom: `bottom-${id}`,
            ...(id === "courtside"
              ? { headwear: "hat-courtside-visor" }
              : { eyewear: "acc-matchday-sport" }),
          });
          Object.assign(recipe.colors, {
            primary: id === "courtside" ? "#337f7d" : "#782e43",
            secondary: "#283539",
            hair: "#594333",
          });
          recipe.body = { weight: col === 3 ? -1 : col === 4 ? 1 : 0 };
          await avatar.setAppearance(recipe);
          scene.add(avatar.object);
          if (motion) {
            // Deterministic exaggerated stride/arm poses expose garment seams.
            avatar.object.traverse((o) => {
              if (o.name === "leg_R") o.rotation.x = -0.8;
              if (o.name === "leg_L") o.rotation.x = 0.55;
              if (o.name === "shin_R") o.rotation.x = 0.9;
              if (o.name === "arm_R") o.rotation.z = -0.8;
              if (o.name === "arm_L") o.rotation.x = 0.6;
            });
          }
          camera.position.set(
            col === 1 ? 5 : col > 2 ? 2 : 0,
            1.09,
            col === 2 ? -5 : col === 1 ? 0 : 5,
          );
          camera.lookAt(0, 1.09, 0);
          camera.updateProjectionMatrix();
          style.update(avatar.object.children[0], new THREE.Vector2(w, h));
          renderer.render(scene, camera);
          ctx.drawImage(renderer.domElement, col * w, row * 570);
          ctx.fillStyle = "#341e27";
          ctx.font = "bold 17px Arial";
          ctx.fillText(
            `${id.toUpperCase()} / ${["FRONT", "SIDE", "BACK", "LEAN", "FULL"][col]}`,
            col * w + 15,
            row * 570 + 548,
          );
          metadata.push({
            id,
            col,
            weight: recipe.body.weight,
            ...avatar.diagnostics(),
          });
        } finally {
          style.clear();
          scene.remove(avatar.object);
          avatar.dispose();
        }
      }
    }
    return { image: canvas.toDataURL("image/png"), metadata };
  } finally {
    renderer.dispose();
    library.dispose();
  }
}
