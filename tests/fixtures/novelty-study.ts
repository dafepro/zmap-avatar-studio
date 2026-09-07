import * as THREE from "three";
import {
  AvatarLibrary,
  ComicStyle,
  defaultRecipe,
  type AvatarInstance,
  type Catalog,
} from "../../src";

export const noveltyParts = {
  headwear: "hat-quack-captain",
  eyewear: "acc-starstruck",
  effect: "effect-pocket-galaxy",
};

const hairColors: Record<string, string> = {
  "hair-tide": "#20323d",
  "hair-volt": "#baa078",
  "hair-nova": "#aa6031",
  "hair-halo": "#5b3e2e",
  "hair-reed": "#70513d",
};

function visitVertices(
  root: THREE.Object3D,
  visit: (p: THREE.Vector3) => void,
) {
  const point = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.comicOutline) return;
    if (object instanceof THREE.SkinnedMesh) object.skeleton.update();
    const positions = object.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld);
      visit(point);
    }
  });
}

function boundsOf(root: THREE.Object3D) {
  const bounds = new THREE.Box3();
  visitVertices(root, (point) => bounds.expandByPoint(point));
  return bounds;
}

/** Actual deformed/skinned positions, independent of the Stage framing code. */
export function projectedBounds(root: THREE.Object3D, camera: THREE.Camera) {
  camera.updateMatrixWorld(true);
  let extent = 0,
    vertices = 0,
    depthClipped = 0,
    nonFinite = 0;
  visitVertices(root, (point) => {
    point.project(camera);
    if (![point.x, point.y, point.z].every(Number.isFinite)) nonFinite++;
    extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
    if (point.z < -1 || point.z > 1) depthClipped++;
    vertices++;
  });
  return { extent, vertices, depthClipped, nonFinite };
}

/** Compare original fitted buffers and material pigments, ignoring ink shells. */
export async function partSnapshot(root: THREE.Object3D, id: string) {
  const materials = new Map<string, string>(),
    buffers: number[] = [];
  let meshes = 0;
  root.traverse((part) => {
    if (part.userData.assetId !== id) return;
    part.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.comicOutline)
        return;
      meshes++;
      const positions = object.geometry.getAttribute("position");
      buffers.push(positions.count);
      for (let i = 0; i < positions.count; i++)
        buffers.push(positions.getX(i), positions.getY(i), positions.getZ(i));
      const indices = object.geometry.getIndex();
      buffers.push(indices?.count ?? 0);
      if (indices)
        for (let i = 0; i < indices.count; i++) buffers.push(indices.getX(i));
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        const color = (material as THREE.MeshStandardMaterial).color;
        if (color) materials.set(material.name, `#${color.getHexString()}`);
      }
    });
  });
  const hash = await crypto.subtle.digest("SHA-256", new Float64Array(buffers));
  return {
    meshes,
    geometryHash: Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    materials: Array.from(materials.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  };
}

function sheet(width: number, height: number, title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f5f2ea";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#341e27";
  context.font = "bold 24px Arial";
  context.fillText(title, 20, 34);
  context.font = "15px Arial";
  context.fillText(
    "Actual browser geometry · shipping assets and illustrated shader",
    20,
    57,
  );
  return { canvas, context };
}

function frame(
  camera: THREE.OrthographicCamera,
  bounds: THREE.Box3,
  width: number,
  height: number,
  yaw: number,
  geometry?: THREE.Object3D,
) {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere()),
    size = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5),
    horizontalRadius = Math.hypot(size.x, size.z),
    pitch = Math.atan2(0.1, 5);
  camera.position
    .copy(sphere.center)
    .add(new THREE.Vector3(Math.sin(yaw) * 5, 0.1, Math.cos(yaw) * 5));
  camera.lookAt(sphere.center);
  camera.updateMatrixWorld(true);
  // Orbits use one shared cylinder across all rows/yaws. Static review panels
  // fit their actual projected geometry so the full-width effect stays legible.
  let horizontal = horizontalRadius,
    vertical = size.y * Math.cos(pitch) + horizontalRadius * Math.sin(pitch);
  if (geometry) {
    horizontal = vertical = 0;
    visitVertices(geometry, (point) => {
      point.applyMatrix4(camera.matrixWorldInverse);
      horizontal = Math.max(horizontal, Math.abs(point.x));
      vertical = Math.max(vertical, Math.abs(point.y));
    });
  }
  const half = Math.max(vertical, horizontal / (width / height)) * 1.12 + 0.004;
  camera.top = half;
  camera.bottom = -half;
  camera.left = (-half * width) / height;
  camera.right = (half * width) / height;
  camera.updateProjectionMatrix();
}

/** Nine hair assets share one orbit scale. Concept PNGs are never rendered here. */
export async function renderNoveltyStudy() {
  const catalog: Catalog = await fetch("/catalog.json").then((r) => r.json());
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href),
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    }),
    scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20),
    avatars: AvatarInstance[] = [];
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  const angles = Array.from({ length: 8 }, (_, index) => index * 45),
    hairs = catalog.assets.filter((asset) => asset.slot === "hair"),
    width = 300,
    height = 380,
    orbits = sheet(
      width * angles.length,
      80 + height * hairs.length,
      "ZOOMAP · QUACK CAPTAIN + STARSTRUCK / 360°",
    ),
    lineup = sheet(1260, 1130, "ZOOMAP · A LITTLE EXTRA CHARACTER"),
    sharedHeadBounds = new THREE.Box3(),
    orbitRecords = [],
    lineupRecords = [];
  const tile = document.createElement("canvas"),
    tileContext = tile.getContext("2d", { willReadFrequently: true })!;
  const draw = (context: CanvasRenderingContext2D, x: number, y: number) => {
    renderer.render(scene, camera);
    tile.width = renderer.domElement.width;
    tile.height = renderer.domElement.height;
    tileContext.drawImage(renderer.domElement, 0, 0);
    const pixels = tileContext.getImageData(0, 0, tile.width, tile.height).data;
    let paintedPixels = 0;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i] > 8) paintedPixels++;
    context.drawImage(tile, x, y);
    return paintedPixels;
  };
  try {
    for (const [row, hair] of hairs.entries()) {
      const avatar = library.create();
      avatars.push(avatar);
      const recipe = defaultRecipe(catalog);
      Object.assign(recipe.parts, noveltyParts, {
        head: row % 2 ? "head-spark" : "head-scout",
        hair: hair.id,
      });
      recipe.body = { weight: row % 2 ? 1 : -1 };
      Object.assign(recipe.colors, {
        hair: hairColors[hair.id] ?? "#514030",
        skin: row % 2 ? "#9e6542" : "#d3a17a",
      });
      await avatar.setAppearance(recipe);
      avatar.update(0, { gesture: "idle", reducedMotion: true });
      avatar.object.traverse((object) => {
        if (!object.userData.assetId) return;
        const asset = catalog.assets.find(
          (item) => item.id === object.userData.assetId,
        )!;
        object.visible = [
          "head",
          "face",
          "hair",
          "headwear",
          "eyewear",
        ].includes(asset.slot);
      });
      sharedHeadBounds.union(boundsOf(avatar.object));
    }
    renderer.setSize(width, height);
    for (const [row, avatar] of avatars.entries()) {
      const style = new ComicStyle({ inkWidth: 1.6 }),
        views = [];
      scene.add(avatar.object);
      try {
        style.update(
          avatar.object.children[0],
          new THREE.Vector2(width, height),
        );
        for (const [column, degrees] of angles.entries()) {
          frame(
            camera,
            sharedHeadBounds,
            width,
            height,
            THREE.MathUtils.degToRad(degrees),
          );
          const bounds = projectedBounds(avatar.object, camera),
            paintedPixels = draw(
              orbits.context,
              column * width,
              80 + row * height,
            );
          orbits.context.fillStyle = "#341e27";
          orbits.context.font = "15px Arial";
          orbits.context.fillText(
            `${hairs[row].id.replace("hair-", "")} / ${degrees}°`,
            column * width + 12,
            80 + (row + 1) * height - 24,
          );
          orbits.context.font = "12px Arial";
          orbits.context.fillText(
            `${avatar.recipe!.parts.head} · build ${avatar.recipe!.body!.weight}`,
            column * width + 12,
            80 + (row + 1) * height - 7,
          );
          views.push({ degrees, paintedPixels, ...bounds });
        }
        orbitRecords.push({
          hair: hairs[row].id,
          recipe: avatar.recipe,
          views,
          ...avatar.diagnostics(),
        });
      } finally {
        style.clear();
        scene.remove(avatar.object);
      }
    }
    for (const [column, id] of ["nova", "halo", "reed"].entries()) {
      const avatar = library.create(),
        style = new ComicStyle({ inkWidth: 1.6 });
      avatars.push(avatar);
      try {
        const recipe = defaultRecipe(catalog);
        Object.assign(recipe.parts, noveltyParts, {
          hair: `hair-${id}`,
          head: column === 1 ? "head-spark" : "head-scout",
          shirt: ["shirt-ember", "shirt-tide", "shirt-volt"][column],
          face: ["face-ember", "face-tide", "face-volt"][column],
        });
        recipe.body = { weight: column - 1 };
        Object.assign(recipe.colors, {
          hair: hairColors[`hair-${id}`],
          primary: ["#cf641e", "#28847f", "#79283a"][column],
          skin: ["#d3a17a", "#855538", "#e5b48c"][column],
        });
        await avatar.setAppearance(recipe);
        avatar.update(0, { gesture: "idle", reducedMotion: true });
        scene.add(avatar.object);
        renderer.setSize(420, 690);
        frame(
          camera,
          boundsOf(avatar.object),
          420,
          690,
          THREE.MathUtils.degToRad([15, -20, 25][column]),
          avatar.object,
        );
        style.update(avatar.object.children[0], new THREE.Vector2(420, 690));
        const fullBounds = projectedBounds(avatar.object, camera),
          paintedPixels = draw(lineup.context, column * 420, 80);
        lineup.context.fillStyle = "#341e27";
        lineup.context.font = "bold 20px Arial";
        lineup.context.fillText(
          `${id.toUpperCase()} / BUILD ${column - 1}`,
          column * 420 + 20,
          785,
        );
        let effect: THREE.Object3D | undefined;
        avatar.object.traverse((object) => {
          if (object.userData.assetId === noveltyParts.effect) effect = object;
        });
        if (!effect) throw new Error("Pocket Galaxy geometry was not mounted");
        renderer.setSize(420, 280);
        frame(
          camera,
          boundsOf(effect),
          420,
          280,
          THREE.MathUtils.degToRad(column * 120),
          effect,
        );
        style.update(avatar.object.children[0], new THREE.Vector2(420, 280));
        const effectBounds = projectedBounds(effect, camera),
          detailPixels = draw(lineup.context, column * 420, 815);
        lineup.context.fillStyle = "#341e27";
        lineup.context.font = "15px Arial";
        lineup.context.fillText(
          `POCKET GALAXY / ${column * 120}°`,
          column * 420 + 20,
          1120,
        );
        lineupRecords.push({
          id,
          recipe,
          fullBounds,
          effectBounds,
          paintedPixels,
          detailPixels,
          ...avatar.diagnostics(),
        });
      } finally {
        style.clear();
        scene.remove(avatar.object);
      }
    }
    return {
      orbitImage: orbits.canvas.toDataURL("image/png"),
      lineupImage: lineup.canvas.toDataURL("image/png"),
      provenance: {
        kind: "actual-browser-geometry",
        catalogRevision: catalog.revision,
        renderer: "shipping glTF + ComicStyle",
        pose: "idle, reduced motion",
        sharedHeadFrame: {
          min: sharedHeadBounds.min.toArray(),
          max: sharedHeadBounds.max.toArray(),
        },
      },
      orbits: orbitRecords,
      lineup: lineupRecords,
    };
  } finally {
    for (const avatar of avatars) avatar.dispose();
    renderer.dispose();
    library.dispose();
  }
}
