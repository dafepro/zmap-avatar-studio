import * as THREE from "three";
import { AvatarLibrary, ComicStyle, defaultRecipe } from "../../src";
export async function renderCapsuleReview() {
  const c = await fetch("/catalog.json").then((r) => r.json());
  const parts = await fetch("/capsule/parts.json").then((r) => r.json());
  c.assets.push(...parts);
  const ids = new Set(parts.map((p: any) => p.id));
  const lib = new AvatarLibrary(c, new URL("/", location.href).href, ((
    input: any,
    init: any,
  ) => {
    const u = new URL(String(input));
    if (ids.has(u.pathname.split("/").pop()!.replace(".glb", "")))
      u.pathname = "/capsule" + u.pathname;
    return fetch(u, init);
  }) as typeof fetch);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(360, 440);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(),
    cam = new THREE.OrthographicCamera(-0.62, 0.62, 0.74, -0.74, 0.01, 20),
    canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 1560;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f1ecde";
  ctx.fillRect(0, 0, 1440, 1560);
  const metadata = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const shirt = col < 2 ? "shirt-circuit" : "shirt-relay";
      const a = lib.create(),
        ink = new ComicStyle({ inkWidth: 1.2 });
      const r = defaultRecipe(c);
      r.parts.shirt = shirt;
      r.parts.accessory = "acc-pulse-pack";
      r.parts.hair = "hair-volt";
      r.body = { weight: [-1, 0, 1][row] };
      Object.assign(r.colors, {
        primary: col < 2 ? "#f26443" : "#529dba",
        secondary: "#27243f",
        trim: "#fff0cc",
        accent: "#c5ee49",
        skin: "#b77f57",
        hair: "#423046",
      });
      try {
        await a.setAppearance(r);
        scene.add(a.object);
        a.update(0, { reducedMotion: true });
        const side = col % 2 === 1;
        if (side) {
          a.update(1, { gesture: "wave", reducedMotion: true });
          cam.position.set(-2.3, 1.35, -5);
        } else cam.position.set(1.7, 1.4, 5);
        cam.lookAt(0, 1.29, 0);
        cam.updateProjectionMatrix();
        ink.update(a.object.children[0], new THREE.Vector2(360, 440));
        renderer.render(scene, cam);
        ctx.drawImage(renderer.domElement, col * 360, row * 520);
        ctx.fillStyle = "#252239";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText(
          `${shirt === "shirt-circuit" ? "SWITCHBACK" : "COURIER"} / ${side ? "WAVE + REAR" : "FRONT"}`,
          col * 360 + 14,
          row * 520 + 462,
        );
        ctx.font = "15px sans-serif";
        ctx.fillText(
          `Build ${r.body.weight} · pack equipped`,
          col * 360 + 14,
          row * 520 + 486,
        );
        metadata.push({
          shirt,
          weight: r.body.weight,
          view: side ? "back-wave" : "front",
          ...a.diagnostics(),
        });
      } finally {
        ink.clear();
        scene.remove(a.object);
        a.dispose();
      }
    }
  renderer.dispose();
  lib.dispose();
  return { image: canvas.toDataURL("image/png"), metadata };
}
