import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  AvatarLibrary,
  ComicStyle,
  WieldController,
  WieldLibrary,
  defaultRecipe,
  emptyWieldLoadout,
  playfulWieldBehaviors,
  type Catalog,
  type Hand,
  type WieldCatalog,
  type WieldEvent,
} from "../src/index.js";
import "./wield-demo.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const descriptions: Record<string, { hint: string; action: string }> = {
  "wield-bubble-comet": {
    hint: "A little comet. A lot of bubbles.",
    action: "Hold to blow bubbles",
  },
  "wield-bonk-bouquet": {
    hint: "One very unserious foam bouquet.",
    action: "Give it a bonk",
  },
  "wield-firefly-lantern": {
    hint: "Keep a tiny constellation company.",
    action: "Switch the glow",
  },
  "wield-doodle-rocket": {
    hint: "Doodles that float away like daydreams.",
    action: "Hold to draw",
  },
  "wield-whirl-pop": {
    hint: "A pocket-sized excuse to make a breeze.",
    action: "Hold to spin",
  },
};
$("app").innerHTML = `
<header><a class="brand" href="/wield.html"><span class="brand-mark" aria-hidden="true">✳</span>pocket play.</a><a class="back" href="/">Back to the avatar studio ↗</a></header>
<section class="intro"><div><p class="eyebrow">Zoomap / A little room for play</p><h1>Pick a toy.<br>Make a little <em>mischief.</em></h1></div><p>Two hands. Five wonderfully silly things.<br>Mix, match, and see what happens.</p></section>
<main class="workspace">
<section class="play-room" aria-label="Interactive avatar playground"><div class="room-top"><span><i></i> THE PLAYROOM</span><span>NO RULES. JUST LITTLE JOYS.</span></div><div class="room-art" aria-hidden="true">GOOD<br>ODD<br>FUN.</div><div class="stamp" aria-hidden="true">100%<br>POCKET-SIZED<br>NON SENSE</div><div id="toy-stage" class="stage"></div><p id="toy-loading" class="loading" role="status">Unpacking the toy box…</p><div class="room-bottom"><p>Drag to turn your character.<br>A different angle, a different kind of silly.</p><div class="orbit" role="group" aria-label="Camera views"><button data-camera="front" aria-pressed="true">Front</button><button data-camera="side" aria-pressed="false">Side</button><button data-camera="back" aria-pressed="false">Back</button></div></div></section>
<aside class="controls" aria-label="Toy controls">${(["left", "right"] as const).map((hand) => `<section class="hand-card ${hand}-card"><div class="hand-title"><h2>${hand === "left" ? "Left" : "Right"} hand</h2><kbd class="key">${hand === "left" ? "Q" : "E"}</kbd></div><label class="sr-only" for="toy-${hand}">${hand === "left" ? "Left" : "Right"} hand toy</label><select id="toy-${hand}" disabled><option value="">Empty hand</option></select><p id="hint-${hand}" class="hint">A little something is on the way.</p><button class="use" id="use-${hand}" aria-pressed="false" disabled>Choose a toy</button></section>`).join("")}
<section class="look-card"><h2 class="card-label">Same you. A new mood.</h2><div class="look-row"><button id="toy-look" disabled>Change look ↻</button><label for="toy-weight">Build</label><input id="toy-weight" aria-label="Body weight" type="range" min="-100" max="100" value="0" disabled></div><label class="reduced"><input id="toy-reduced" type="checkbox"> Keep things still · reduced motion</label></section>
<section class="notebook"><div class="log-title"><h2>Little things happened</h2><span>Just in this playroom</span></div><ol id="toy-events" aria-label="Recent playroom activity"><li>Your next little adventure goes here.</li></ol></section>
</aside></main><div class="status"><p id="toy-status" role="status">Getting ready to play…</p><button id="toy-clear" class="clear" disabled>Put the toys away ↗</button></div><footer><strong>ZOOMAP · POCKET PLAY</strong><span>Small moments. Big personality. Made for being you.</span></footer>`;

const lifecycle = new AbortController(),
  signal = lifecycle.signal;
const reduced = $<HTMLInputElement>("toy-reduced");
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
reduced.checked = motionPreference.matches;
motionPreference.addEventListener(
  "change",
  () => {
    reduced.checked = motionPreference.matches;
  },
  { signal },
);
const status = (message: string, error = false) => {
  $("toy-status").textContent = message;
  $("toy-status").classList.toggle("error", error);
};
async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Could not load the toy collection (${response.status})`);
  return response.json();
}

async function start() {
  const [catalog, toyCatalog] = await Promise.all([
    json<Catalog>("/catalog.json"),
    json<WieldCatalog>("/wield/catalog.json"),
  ]);
  const library = new AvatarLibrary(catalog, new URL("/", location.href).href);
  const wieldLibrary = new WieldLibrary(
    toyCatalog,
    new URL("/wield/", location.href).href,
  );
  const avatar = library.create();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const stage = $("toy-stage");
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Illustrated character holding your chosen toys. Drag to orbit.",
  );
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.01, 30);
  camera.position.set(0, 1.3, 7);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1.05, 0);
  orbit.enablePan = false;
  orbit.enableZoom = false;
  orbit.minPolarAngle = Math.PI * 0.32;
  orbit.maxPolarAngle = Math.PI * 0.58;
  orbit.update();
  scene.add(avatar.object, new THREE.HemisphereLight(0xfff7e1, 0x788d81, 2.2));
  const light = new THREE.DirectionalLight(0xffedcf, 3);
  light.position.set(-3, 6, 5);
  scene.add(light);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.87, 64),
    new THREE.MeshBasicMaterial({
      color: "#ced7bf",
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  scene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.96, 0.965, 80),
    new THREE.MeshBasicMaterial({ color: "#b8c6b0", side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.003;
  scene.add(ring);
  const style = new ComicStyle({
    inkWidth: 1.65,
    shadowStrength: 0.8,
    pigment: 0.32,
  });
  const log: { text: string; hand: Hand }[] = [];
  let lastEvent = "",
    repeated = 0;
  const eventText: Record<string, string> = {
    bubble: "A bubble wandered off",
    bonk: "A perfectly silly bonk",
    light: "A little glow",
    "ink-point": "A doodle in the air",
    "spin-start": "A tiny breeze picked up",
    "spin-release": "Round and round it goes",
  };
  const onEvent = (event: WieldEvent) => {
    const key = `${event.hand}:${event.type}`;
    const text =
      event.type === "light"
        ? event.value
          ? "The fireflies woke up"
          : "The fireflies are resting"
        : (eventText[event.type] ?? event.type);
    if (key === lastEvent) {
      repeated++;
      log[0] = { text: `${text} ×${repeated}`, hand: event.hand };
    } else {
      lastEvent = key;
      repeated = 1;
      log.unshift({ text, hand: event.hand });
      log.length = Math.min(log.length, 6);
    }
    $("toy-events").replaceChildren(
      ...log.map((entry) => {
        const row = document.createElement("li"),
          hand = document.createElement("span");
        row.append(document.createTextNode(entry.text));
        hand.textContent = entry.hand;
        row.append(hand);
        return row;
      }),
    );
  };
  const wield = new WieldController(
    avatar,
    wieldLibrary,
    playfulWieldBehaviors(),
    {
      onEvent,
      onError: (error) => status(`That toy stopped: ${String(error)}`, true),
    },
  );
  let recipe = defaultRecipe(catalog);
  recipe.parts.hair = "hair-nova";
  Object.assign(recipe.colors, {
    hair: "#aa6031",
    skin: "#c08a64",
    primary: "#f5f0e5",
    secondary: "#293d3a",
  });
  let time = 0,
    previous = 0,
    raf = 0,
    closed = false,
    radius = 1.27;
  let desired = emptyWieldLoadout(toyCatalog),
    request = 0;
  const buttons = {
    left: $<HTMLButtonElement>("use-left"),
    right: $<HTMLButtonElement>("use-right"),
  };
  const selections = {
    left: $<HTMLSelectElement>("toy-left"),
    right: $<HTMLSelectElement>("toy-right"),
  };
  const displayed: Partial<
    Record<Hand, ReturnType<WieldController["getHand"]>>
  > = {};
  const refresh = () => {
    for (const hand of ["left", "right"] as const) {
      const held = wield.getHand(hand),
        detail = held && descriptions[held.item.id];
      if (displayed[hand] !== held) {
        displayed[hand] = held;
        buttons[hand].setAttribute("aria-pressed", "false");
      }
      buttons[hand].disabled = !held || held.state !== "ready";
      buttons[hand].textContent = detail?.action ?? "Choose a toy";
      $("hint-" + hand).textContent =
        detail?.hint ?? "An empty hand. Room for possibility.";
    }
  };
  const cancel = () => {
    wield.cancel();
    for (const hand of ["left", "right"] as const)
      buttons[hand].setAttribute("aria-pressed", "false");
  };
  function resize() {
    if (closed) return;
    const { width, height } = stage.getBoundingClientRect(),
      aspect = Math.max(1, width) / Math.max(1, height);
    renderer.setSize(width, height);
    const half = radius / Math.min(1, aspect);
    camera.top = half;
    camera.bottom = -half;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.updateProjectionMatrix();
  }
  function frame() {
    avatar.update(time, { reducedMotion: reduced.checked });
    avatar.object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3(),
      point = new THREE.Vector3();
    avatar.object.traverseVisible((node) => {
      if (
        !(node instanceof THREE.Mesh) ||
        node.userData.comicOutline ||
        node instanceof THREE.InstancedMesh
      )
        return;
      for (let i = 0; i < node.geometry.attributes.position.count; i++) {
        node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
        bounds.expandByPoint(point);
      }
    });
    const center = bounds.getCenter(new THREE.Vector3()),
      sphere = bounds.getBoundingSphere(new THREE.Sphere());
    radius = Math.max(1.27, sphere.radius * 1.12);
    const delta = camera.position.clone().sub(orbit.target);
    orbit.target.copy(center);
    camera.position.copy(center).add(delta);
    orbit.update();
    resize();
  }
  async function equip() {
    const revision = ++request;
    refresh();
    status("Unpacking your next little idea…");
    try {
      await wield.setLoadout(desired);
      if (revision !== request || closed) return;
      frame();
      status("Ready for mischief. Hold a button, or try Q and E.");
    } catch (error) {
      if (revision !== request || closed) return;
      desired = wield.loadout;
      for (const hand of ["left", "right"] as const)
        selections[hand].value = desired[hand] ?? "";
      status((error as Error).message, true);
    } finally {
      if (revision === request && !closed) {
        refresh();
      }
    }
  }
  for (const hand of ["left", "right"] as const) {
    let pointer: number | undefined;
    for (const item of toyCatalog.items)
      selections[hand].add(new Option(item.label, item.id));
    selections[hand].addEventListener(
      "change",
      () => {
        desired = { ...desired, [hand]: selections[hand].value || null };
        void equip();
      },
      { signal },
    );
    const press = () => {
      if (buttons[hand].disabled) return;
      wield.press(hand);
      buttons[hand].setAttribute("aria-pressed", "true");
    };
    const release = () => {
      wield.release(hand);
      buttons[hand].setAttribute("aria-pressed", "false");
    };
    buttons[hand].addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.button !== 0 ||
          pointer !== undefined ||
          buttons[hand].disabled
        )
          return;
        pointer = event.pointerId;
        buttons[hand].setPointerCapture(event.pointerId);
        press();
      },
      { signal },
    );
    const endPointer = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = undefined;
      release();
    };
    buttons[hand].addEventListener("pointerup", endPointer, { signal });
    buttons[hand].addEventListener("pointercancel", endPointer, { signal });
    buttons[hand].addEventListener("lostpointercapture", endPointer, {
      signal,
    });
    buttons[hand].addEventListener(
      "keydown",
      (event) => {
        if ([" ", "Enter"].includes(event.key)) {
          event.preventDefault();
          if (!event.repeat) press();
        }
      },
      { signal },
    );
    buttons[hand].addEventListener(
      "keyup",
      (event) => {
        if ([" ", "Enter"].includes(event.key)) {
          event.preventDefault();
          release();
        }
      },
      { signal },
    );
    buttons[hand].addEventListener(
      "click",
      (event) => {
        if (event.detail !== 0 || buttons[hand].disabled) return;
        const behavior = wield.getHand(hand)?.item.behavior;
        const continuous = [
          "bubble-comet",
          "doodle-rocket",
          "whirl-pop",
        ].includes(behavior ?? "");
        if (continuous && buttons[hand].getAttribute("aria-pressed") === "true")
          release();
        else {
          press();
          if (!continuous) release();
        }
      },
      { signal },
    );
  }
  const keyHand = (event: KeyboardEvent): Hand | undefined =>
    event.code === "KeyQ"
      ? "left"
      : event.code === "KeyE"
        ? "right"
        : undefined;
  window.addEventListener(
    "keydown",
    (event) => {
      const hand = keyHand(event),
        target = event.target as HTMLElement;
      if (
        !hand ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target.closest("input,select,textarea,[contenteditable=true]")
      )
        return;
      event.preventDefault();
      if (!buttons[hand].disabled) {
        wield.press(hand);
        buttons[hand].setAttribute("aria-pressed", "true");
      }
    },
    { signal },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      const hand = keyHand(event);
      if (hand) {
        wield.release(hand);
        buttons[hand].setAttribute("aria-pressed", "false");
      }
    },
    { signal },
  );
  window.addEventListener("blur", cancel, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) cancel();
      wield.setPaused(document.hidden);
      previous = 0;
    },
    { signal },
  );
  reduced.addEventListener("change", cancel, { signal });
  $("toy-clear").addEventListener(
    "click",
    () => {
      desired = emptyWieldLoadout(toyCatalog);
      selections.left.value = selections.right.value = "";
      void equip();
    },
    { signal },
  );
  let look = 0,
    appearanceRequest = 0;
  const applyAppearance = async () => {
    const revision = ++appearanceRequest;
    try {
      await avatar.setAppearance(recipe);
      if (revision === appearanceRequest && !closed) frame();
    } catch (error) {
      if (revision === appearanceRequest && !closed)
        status((error as Error).message, true);
    }
  };
  $("toy-look").addEventListener(
    "click",
    () => {
      look = (look + 1) % 3;
      const looks = [
        {
          hair: "hair-nova",
          shirt: "shirt-jersey",
          color: "#f5f0e5",
          pigment: "#aa6031",
        },
        {
          hair: "hair-halo",
          shirt: "shirt-tide",
          color: "#24796d",
          pigment: "#533b2e",
        },
        {
          hair: "hair-reed",
          shirt: "shirt-volt",
          color: "#e89b60",
          pigment: "#70513d",
        },
      ];
      const next = looks[look];
      recipe = {
        ...recipe,
        parts: { ...recipe.parts, hair: next.hair, shirt: next.shirt },
        colors: { ...recipe.colors, primary: next.color, hair: next.pigment },
      };
      void applyAppearance();
    },
    { signal },
  );
  $<HTMLInputElement>("toy-weight").addEventListener(
    "input",
    (event) => {
      recipe = {
        ...recipe,
        body: {
          weight: Number((event.target as HTMLInputElement).value) / 100,
        },
      };
      void applyAppearance();
    },
    { signal },
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-camera]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => {
          const yaw =
            button.dataset.camera === "side"
              ? Math.PI / 2
              : button.dataset.camera === "back"
                ? Math.PI
                : 0;
          camera.position
            .copy(orbit.target)
            .add(new THREE.Vector3(Math.sin(yaw) * 7, 0.22, Math.cos(yaw) * 7));
          orbit.update();
          document
            .querySelectorAll("[data-camera]")
            .forEach((other) =>
              other.setAttribute("aria-pressed", String(button === other)),
            );
        },
        { signal },
      ),
    );
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  const pixels = new THREE.Vector2();
  const animate = (milliseconds: number) => {
    if (closed) return;
    const dt = previous
      ? Math.min(0.05, Math.max(0, (milliseconds - previous) / 1000))
      : 0;
    previous = milliseconds;
    if (!document.hidden) {
      time += dt;
      avatar.update(time, { gesture: "idle", reducedMotion: reduced.checked });
      style.update(avatar.object, renderer.getDrawingBufferSize(pixels));
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(animate);
  };
  function dispose() {
    if (closed) return;
    closed = true;
    lifecycle.abort();
    cancelAnimationFrame(raf);
    observer.disconnect();
    orbit.dispose();
    style.clear();
    wield.dispose();
    avatar.dispose();
    library.dispose();
    wieldLibrary.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
    ring.geometry.dispose();
    ring.material.dispose();
    renderer.dispose();
  }
  window.addEventListener("pagehide", dispose, { once: true, signal });
  try {
    await avatar.setAppearance(recipe);
    if (signal.aborted) {
      dispose();
      return;
    }
    desired = {
      ...desired,
      left: "wield-firefly-lantern",
      right: "wield-bubble-comet",
    };
    selections.left.value = desired.left!;
    selections.right.value = desired.right!;
    await equip();
    frame();
    raf = requestAnimationFrame(animate);
    $("toy-loading").hidden = true;
    for (const id of [
      "toy-left",
      "toy-right",
      "toy-look",
      "toy-weight",
      "toy-clear",
    ])
      $<HTMLButtonElement>(id).disabled = false;
    (window as any).wieldPlayground = {
      avatar,
      wield,
      library,
      wieldLibrary,
      camera,
      renderer,
      orbit,
      get recipe() {
        return structuredClone(recipe);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
void start().catch((error) => {
  $("toy-loading").textContent = "The toy box could not open.";
  status((error as Error).message, true);
});
