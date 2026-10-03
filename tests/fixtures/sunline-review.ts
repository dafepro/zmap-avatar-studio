import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  type Catalog,
  type Recipe,
} from "../../src";

/** Shipping ComicStyle + actual GLBs. A canvas sheet, not concept/source art. */
export async function renderSunlineReview() {
  const catalog: Catalog = await fetch("/capsule/catalog.json").then((r) =>
    r.json(),
  );
  const look = await fetch("/capsule/looks/sunline-courier.shift.json").then(
    (r) => r.json(),
  );
  const library = new AvatarLibrary(
    catalog,
    new URL("/capsule/", location.href).href,
  );
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const width = 360,
    height = 470;
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-0.88, 0.88, 1.15, -1.15, 0.01, 20);
  const canvas = document.createElement("canvas");
  canvas.width = width * 5;
  canvas.height = height * 4 + 80;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4e8cf";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#303643";
  ctx.font = "bold 28px Arial";
  ctx.fillText(
    "SUNLINE COURIER · SHIPPING WEBGL / FIVE INDEPENDENT PIECES",
    24,
    36,
  );
  const records = [];
  try {
    for (const [row, { head, weight, optional }] of [
      { head: "head-scout", weight: -1, optional: false },
      { head: "head-scout", weight: 0, optional: false },
      { head: "head-spark", weight: 1, optional: false },
      { head: "head-spark", weight: 1, optional: true },
    ].entries()) {
      for (const [col, { label, yaw, motion }] of [
        { label: "FRONT", yaw: 0, motion: "idle" },
        { label: "SIDE", yaw: 90, motion: "idle" },
        { label: "BACK", yaw: 180, motion: "idle" },
        { label: "WAVE", yaw: 25, motion: "wave" },
        { label: "RUN", yaw: -32, motion: "run" },
      ].entries()) {
        const avatar = library.create(),
          style = new ComicStyle({ inkWidth: 1.45 });
        try {
          const recipe: Recipe = structuredClone(look.appearance);
          recipe.parts.head = head;
          recipe.body = { weight };
          if (optional)
            Object.assign(recipe.parts, {
              hair: "hair-volt",
              eyewear: "acc-glasses",
              facialHair: "facial-mustache",
              effect: "effect-orbit",
            });
          await avatar.setAppearance(recipe);
          scene.add(avatar.object);
          for (let frame = 0; frame <= 60; frame++)
            avatar.update(
              frame / 60,
              motion === "wave"
                ? { emote: { id: "wave", elapsed: frame / 60 } }
                : motion === "run"
                  ? { velocity: { x: 0, z: 3.8 }, grounded: true }
                  : {},
            );
          camera.position.set(
            5 * Math.sin((yaw * Math.PI) / 180),
            1.16,
            5 * Math.cos((yaw * Math.PI) / 180),
          );
          camera.lookAt(0, 1.08, 0);
          camera.updateProjectionMatrix();
          style.update(
            avatar.object.children[0],
            new THREE.Vector2(width, height),
          );
          renderer.render(scene, camera);
          const x = col * width,
            y = 80 + row * height;
          ctx.drawImage(renderer.domElement, x, y);
          ctx.fillStyle = "#303643";
          ctx.font = "bold 17px Arial";
          ctx.fillText(
            `${label} · ${head.replace("head-", "")} / ${weight}${optional ? " / MAX SLOTS" : ""}`,
            x + 14,
            y + height - 13,
          );
          records.push({
            head,
            weight,
            optional,
            view: label,
            motion,
            recipe,
            ...avatar.diagnostics(),
            renderer: renderer
              .getContext()
              .getParameter(renderer.getContext().VERSION),
          });
        } finally {
          style.clear();
          scene.remove(avatar.object);
          avatar.dispose();
        }
      }
    }
    return { image: canvas.toDataURL("image/png"), records };
  } finally {
    renderer.dispose();
    library.dispose();
  }
}
