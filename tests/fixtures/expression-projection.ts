import * as THREE from "three";
import { AvatarLibrary, ComicStyle, defaultRecipe } from "../../src";

/** Compare actual painted pixels with each projection layer suppressed. */
export async function inspectExpressionProjection() {
  const catalog = await fetch("/catalog.json").then((r) => r.json());
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href),
    avatar = library.create();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(256, 256);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-0.29, 0.29, 0.29, -0.29, 0.01, 10);
  camera.position.set(0, 1.8, 3);
  camera.lookAt(0, 1.8, 0);
  scene.add(new THREE.HemisphereLight("#ffffff", "#888888", 3));
  scene.add(avatar.object);
  const style = new ComicStyle(),
    results = [];
  try {
    const recipe = defaultRecipe(catalog);
    recipe.parts.hair = null;
    await avatar.setAppearance(recipe);
    avatar.object.traverse((o) => {
      if (o.userData.assetId)
        o.visible = ["head-scout", "face-focus"].includes(o.userData.assetId);
    });
    const capture = () => {
      renderer.render(scene, camera);
      const gl = renderer.getContext(),
        data = new Uint8Array(256 * 256 * 4);
      gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    for (const illustrated of [false, true]) {
      if (illustrated)
        style.update(avatar.object.children[0], new THREE.Vector2(256, 256));
      const materials = new Set<THREE.Material>();
      avatar.object.traverse((o) => {
        if (o instanceof THREE.Mesh)
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m.userData.expressionProjection) materials.add(m);
      });
      for (const yaw of [0, 45, 70, 90]) {
        avatar.object.rotation.y = THREE.MathUtils.degToRad(yaw);
        const full = capture();
        for (const layer of ["front", "profile"]) {
          for (const m of materials)
            if (m.userData.expressionProjection === layer) m.visible = false;
          const without = capture();
          let changed = 0;
          for (let i = 0; i < full.length; i += 4)
            if (
              Math.abs(full[i] - without[i]) +
                Math.abs(full[i + 1] - without[i + 1]) +
                Math.abs(full[i + 2] - without[i + 2]) >
              15
            )
              changed++;
          results.push({ illustrated, yaw, layer, changed });
          for (const m of materials) m.visible = true;
        }
      }
    }
    return results;
  } finally {
    style.dispose();
    avatar.dispose();
    library.dispose();
    renderer.dispose();
  }
}
