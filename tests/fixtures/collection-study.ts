import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";

/** Actual exported assets under the shipping renderer; sheets are references only. */
export async function renderCollectionStudy(necks = false) {
  const catalog: Catalog = await fetch("/catalog.json").then((r) => r.json());
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const w = 360,
    h = 480;
  renderer.setSize(w, h);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-0.9, 0.9, 1.2, -1.2, 0.01, 20);
  const canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 1590;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const metadata = [];
  try {
    for (const [row, [id, primary, skin, hair]] of [
      ["ember", "#cf641e", "#9e6542", "#30251f"],
      ["tide", "#28847f", "#bc8565", "#182b35"],
      ["volt", "#79283a", "#e5b48c", "#bb9964"],
    ].entries()) {
      for (let col = 0; col < 4; col++) {
        const avatar = library.create(),
          style = new ComicStyle({ inkWidth: 1.6 });
        try {
          const recipe = defaultRecipe(catalog);
          Object.assign(recipe.parts, {
            hair: `hair-${id}`,
            face: `face-${id}`,
            shirt: `shirt-${id}`,
          });
          Object.assign(recipe.colors, { primary, skin, hair });
          recipe.body = { weight: necks ? [-1, 0, 1, 1][col] : 0 };
          if (col === 3)
            Object.assign(recipe.parts, {
              headwear: "hat-club-cap",
              eyewear: "acc-glasses",
              facialHair: "facial-mustache",
            });
          await avatar.setAppearance(recipe);
          scene.add(avatar.object);
          const half = necks ? 0.4 : col === 2 ? 0.43 : 1.14,
            focus = necks ? 1.65 : col === 2 ? 1.85 : 1.09;
          camera.top = half;
          camera.bottom = -half;
          camera.left = (-half * w) / h;
          camera.right = (half * w) / h;
          if (!necks && col === 1) camera.position.set(5, focus, 0);
          else if (!necks && col === 2)
            camera.position.set(0, focus + 5, 0.001);
          else camera.position.set(col === 3 ? 2 : 0, focus, 5);
          camera.lookAt(0, focus, 0);
          camera.updateProjectionMatrix();
          style.update(avatar.object.children[0], new THREE.Vector2(w, h));
          renderer.render(scene, camera);
          const x = col * w,
            y = row * 530;
          ctx.drawImage(renderer.domElement, x, y);
          ctx.fillStyle = "#341e27";
          ctx.font = "bold 18px Arial";
          ctx.fillText(
            `${id.toUpperCase()} / ${(necks ? ["LEAN", "STUDY", "HEAVIER", "HEAVIER + FIT"] : ["FRONT", "SIDE", "TOP", "ACCESSORIES"])[col]}`,
            x + 15,
            y + 506,
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
