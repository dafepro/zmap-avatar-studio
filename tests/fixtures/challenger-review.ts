import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type Catalog,
} from "../../src";

/** Actual browser/WebGL pixel evidence. No artwork or generated concept is composited here. */
export async function renderChallengerReview() {
  const catalog: Catalog = await fetch("/capsule/catalog.json").then((r) =>
    r.json(),
  );
  const descriptor = catalog.assets.find(
    (asset) => asset.id === "face-challenger",
  );
  if (!descriptor)
    throw new Error("Challenger is missing from the generated capsule catalog");
  const library = new AvatarLibrary(
    catalog,
    new URL("/capsule/", location.href).href,
  );
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(320, 360);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#777777", 3));
  const camera = new THREE.OrthographicCamera(
    -0.28,
    0.28,
    0.315,
    -0.315,
    0.01,
    10,
  );
  camera.position.set(0, 1.8, 3);
  camera.lookAt(0, 1.8, 0);
  const sheet = document.createElement("canvas");
  sheet.width = 1600;
  sheet.height = 920;
  const ctx = sheet.getContext("2d")!;
  ctx.fillStyle = "#eee8dd";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = "#282c3a";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText("CHALLENGER / ACTUAL FITTED WEBGL EXPRESSION", 24, 42);
  const projection: {
    head: string;
    illustrated: boolean;
    yaw: number;
    layer: string;
    changed: number;
  }[] = [];
  const assemblies: unknown[] = [];
  const pixels = () => {
    renderer.render(scene, camera);
    const gl = renderer.getContext(),
      data = new Uint8Array(320 * 360 * 4);
    gl.readPixels(0, 0, 320, 360, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return data;
  };
  const avatar = library.create(),
    ink = new ComicStyle();
  scene.add(avatar.object);
  try {
    for (const [row, head] of ["head-scout", "head-spark"].entries()) {
      const recipe = defaultRecipe(catalog);
      recipe.parts.head = head;
      recipe.parts.face = descriptor.id;
      recipe.parts.hair = null;
      recipe.colors.skin = row === 0 ? "#bf8357" : "#d7a77f";
      await avatar.setAppearance(recipe);
      avatar.update(0, { reducedMotion: true });
      avatar.object.traverse((o) => {
        if (o.userData.assetId)
          o.visible = [head, descriptor.id].includes(o.userData.assetId);
      });
      for (const illustrated of [false, true]) {
        if (illustrated)
          ink.update(avatar.object.children[0], new THREE.Vector2(320, 360));
        const materials = new Set<THREE.Material>();
        avatar.object.traverse((o) => {
          if (o instanceof THREE.Mesh)
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material])
              if (m.userData.expressionProjection) materials.add(m);
        });
        for (const yaw of [-90, -70, -45, 0, 45, 70, 90]) {
          avatar.object.rotation.y = THREE.MathUtils.degToRad(yaw);
          const full = pixels();
          for (const layer of ["front", "profile"]) {
            for (const m of materials)
              if (m.userData.expressionProjection === layer) m.visible = false;
            const without = pixels();
            let changed = 0;
            for (let i = 0; i < full.length; i += 4)
              if (
                Math.abs(full[i] - without[i]) +
                  Math.abs(full[i + 1] - without[i + 1]) +
                  Math.abs(full[i + 2] - without[i + 2]) >
                15
              )
                changed++;
            projection.push({ head, illustrated, yaw, layer, changed });
            for (const m of materials) m.visible = true;
          }
        }
      }
      for (const [col, yaw] of [0, -45, 45, -90, 90].entries()) {
        avatar.object.rotation.y = THREE.MathUtils.degToRad(yaw);
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, col * 320, 70 + row * 420);
        ctx.fillStyle = "#282c3a";
        ctx.font = "bold 17px sans-serif";
        ctx.fillText(
          `${head.replace("head-", "").toUpperCase()} / ${yaw}°`,
          col * 320 + 18,
          450 + row * 420,
        );
      }
      assemblies.push({ head, ...avatar.diagnostics() });
      ink.clear();
    }
    const action = document.createElement("canvas");
    action.width = 1280;
    action.height = 850;
    const ac = action.getContext("2d")!;
    ac.fillStyle = "#eee8dd";
    ac.fillRect(0, 0, 1280, 850);
    ac.fillStyle = "#282c3a";
    ac.font = "bold 30px sans-serif";
    ac.fillText("CHALLENGER / ASSEMBLED AVATAR IN MOTION", 24, 44);
    renderer.setSize(640, 740);
    camera.left = -0.86;
    camera.right = 0.86;
    camera.top = 1.02;
    camera.bottom = -1.02;
    camera.position.set(0, 1.08, 4);
    camera.lookAt(0, 1.08, 0);
    camera.updateProjectionMatrix();
    for (const [col, gesture] of (["run", "wave"] as const).entries()) {
      const recipe = defaultRecipe(catalog);
      Object.assign(recipe.parts, {
        head: col === 0 ? "head-scout" : "head-spark",
        face: descriptor.id,
        hair: "hair-ember",
        shirt: "shirt-volt",
        shoes: "shoes-high",
      });
      Object.assign(recipe.colors, {
        skin: col === 0 ? "#bf8357" : "#d7a77f",
        primary: "#cf5739",
        secondary: "#282c3a",
        trim: "#fff1d1",
        hair: "#363130",
      });
      await avatar.setAppearance(recipe);
      for (const t of [0, 0.5, 1, 1.125]) avatar.update(t, { gesture });
      avatar.object.rotation.y = col === 0 ? -0.28 : 0.28;
      ink.update(avatar.object.children[0], new THREE.Vector2(640, 740));
      renderer.render(scene, camera);
      ac.drawImage(renderer.domElement, col * 640, 60);
      ac.fillStyle = "#282c3a";
      ac.font = "bold 20px sans-serif";
      ac.fillText(
        `${gesture.toUpperCase()} / ${recipe.parts.head} / fitted Challenger`,
        col * 640 + 24,
        826,
      );
      assemblies.push({ gesture, ...avatar.diagnostics() });
      ink.clear();
    }
    return {
      headSheet: sheet.toDataURL("image/png"),
      action: action.toDataURL("image/png"),
      projection,
      assemblies,
    };
  } finally {
    ink.dispose();
    avatar.dispose();
    library.dispose();
    renderer.dispose();
  }
}
