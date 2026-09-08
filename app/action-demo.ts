import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  AvatarLibrary,
  ComicStyle,
  WieldController,
  WieldLibrary,
  defaultRecipe,
  emptyWieldLoadout,
  fieldToolBehaviors,
  type Hand,
} from "../src/index.js";
import "./action-demo.css";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const descriptions: Record<string, [string, string]> = {
  "wield-tether-winch": [
    "PULL. PASS. REPEAT.",
    "Catch a loose object in your line of sight. Hold to reel it close, then release to send it toward a friend.",
  ],
  "wield-rebound-panel": [
    "SET UP THE NEXT MOVE.",
    "Brace the panel to redirect incoming objects. Teammates who meet its front get a forward boost.",
  ],
  "wield-wake-driver": [
    "MAKE SOME ROOM.",
    "Charge a ground pulse that lifts and nudges nearby players and loose objects. A cooldown gives everyone a chance to respond.",
  ],
};
$("app").innerHTML =
  `<header><a href="/">zoomap <span>/ FIELD TOOLS</span></a><a id="yard" class="solid" href="http://localhost:5173/action.html">Enter the shared yard ↗</a></header><main><section class="intro"><p class="eyebrow">03 DEVICES / TWO HANDS / ONE SHARED WORLD</p><h1>A reason to<br><em>play together.</em></h1><p>Pull a pass into place. Return a shot. Give someone a lift.</p></section><div class="workbench"><section class="viewport"><div class="caption"><span>FIELD STUDY / <strong id="device-name">LOADING</strong></span><span>DRAG TO ROTATE</span></div><div id="stage"></div><div class="cameras">${["front", "side", "back", "top"].map((v) => `<button data-view="${v}">${v}</button>`).join("")}</div></section><aside><div id="choices" role="group" aria-label="Field tools"></div><h2 id="tagline"></h2><p id="description"></p><button id="mechanism" disabled aria-pressed="false">Hold to preview mechanism</button><p class="note">Inspect the grip and mechanism here. Try the shared interactions in the yard.</p><div class="settings"><label>Primary hand <select id="primary"><option value="right">Right</option><option value="left">Left</option></select></label><label>Body build <input id="weight" aria-label="Body weight" type="range" min="-100" max="100" value="0"></label><label><input id="motion" type="checkbox"> Walk with tool</label><label><input id="reduced" type="checkbox"> Reduced motion</label></div><a id="concept" target="_blank" href="/references/action/winch.png">Front / side / top concept sheet ↗</a></aside></div><p id="status" role="status">Preparing the components…</p></main><footer>ZOOMAP · FIELD TOOLS <span>Designed to start something together.</span></footer>`;
const yard = new URL("/action.html", location.href);
yard.port = "5173";
$("yard").setAttribute("href", yard.href);
async function start() {
  const lifecycle = new AbortController(),
    { signal } = lifecycle;
  const cleanup: (() => void)[] = [];
  let closed = false,
    raf = 0;
  const dispose = () => {
    if (closed) return;
    closed = true;
    lifecycle.abort();
    cancelAnimationFrame(raf);
    for (const release of cleanup.reverse()) {
      try {
        release();
      } catch {
        /* finish all owners */
      }
    }
    cleanup.length = 0;
  };
  window.addEventListener("pagehide", dispose, { once: true, signal });
  import.meta.hot?.dispose(dispose);
  const error = (reason: unknown) => {
    if (closed) return;
    $("status").textContent =
      reason instanceof Error ? reason.message : String(reason);
    $("status").dataset.error = "true";
  };
  for (const control of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >(".settings input, .settings select"))
    control.disabled = true;
  try {
    const json = async (path: string) => {
      const response = await fetch(path, { signal });
      if (!response.ok)
        throw Error(`Collection unavailable (${response.status})`);
      return response.json();
    };
    const [catalogData, equipmentData] = await Promise.all([
      json("/catalog.json"),
      json("/action/catalog.json"),
    ]);
    if (closed) return;
    const library = new AvatarLibrary(
      catalogData,
      new URL("/", location.href).href,
    );
    cleanup.push(() => library.dispose());
    const wieldLibrary = new WieldLibrary(
      equipmentData,
      new URL("/action/", location.href).href,
    );
    cleanup.push(() => wieldLibrary.dispose());
    const catalog = library.catalog,
      equipment = wieldLibrary.catalog,
      avatar = library.create();
    cleanup.push(() => avatar.dispose());
    const wield = new WieldController(
      avatar,
      wieldLibrary,
      fieldToolBehaviors(),
      {
        onError: (reason, hand) => {
          if (hand) {
            cancel();
            error(reason);
            button.disabled = true;
          }
        },
      },
    );
    cleanup.push(() => wield.dispose());
    const style = new ComicStyle({ inkWidth: 1.7 });
    cleanup.push(() => style.clear());
    const scene = new THREE.Scene(),
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }),
      camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.01, 30);
    cleanup.push(() => {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0, 0);
    $("stage").append(renderer.domElement);
    scene.add(avatar.object);
    camera.position.set(3.2, 2.05, 5);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 1.03, 0);
    orbit.enablePan = false;
    orbit.enableZoom = false;
    orbit.update();
    cleanup.push(() => orbit.dispose());
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 48),
      new THREE.MeshBasicMaterial({
        color: "#bcc4b6",
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.003;
    scene.add(floor);
    cleanup.push(() => {
      floor.geometry.dispose();
      floor.material.dispose();
      floor.removeFromParent();
    });
    let selected = equipment.items[0].id,
      primary: Hand = "right",
      time = 0,
      previous = 0,
      request = 0,
      appearance = 0;
    let pointer: number | undefined,
      keyboard: string | undefined,
      assistive = false;
    const button = $<HTMLButtonElement>("mechanism"),
      reduced = $<HTMLInputElement>("reduced");
    const recipe = defaultRecipe(catalog);
    recipe.parts.hair = "hair-sweep";
    recipe.colors = {
      skin: "#c68b60",
      hair: "#382a22",
      primary: "#f1efe8",
      secondary: "#29363d",
    };
    const cancel = () => {
      pointer = undefined;
      keyboard = undefined;
      assistive = false;
      wield.cancel();
      button.setAttribute("aria-pressed", "false");
    };
    const display = (id: string) => {
      const item = equipment.items.find((item) => item.id === id)!;
      $("device-name").textContent = item.label;
      $("tagline").textContent = descriptions[id][0];
      $("description").textContent = descriptions[id][1];
      const key = id.includes("winch")
        ? "winch"
        : id.includes("panel")
          ? "panel"
          : "driver";
      $("concept").setAttribute("href", `/references/action/${key}.png`);
      for (const choice of document.querySelectorAll<HTMLElement>(
        "[data-item]",
      ))
        choice.setAttribute("aria-pressed", String(choice.dataset.item === id));
    };
    const equip = async () => {
      const revision = ++request,
        itemId = selected,
        hand = primary;
      cancel();
      button.disabled = true;
      $("status").textContent = "Fitting both hands…";
      delete $("status").dataset.error;
      try {
        const committed = await wield.setLoadout({
          ...emptyWieldLoadout(equipment),
          twoHanded: { item: itemId, primary: hand },
        });
        if (closed || revision !== request || !committed) return;
        display(itemId);
        $("status").textContent = "Both hands fitted. Ready to inspect.";
        button.disabled = false;
      } catch (reason) {
        if (closed || revision !== request) return;
        const ready = wield.loadout.twoHanded;
        if (ready && wield.getHand(ready.primary)?.state === "ready") {
          selected = ready.item;
          primary = ready.primary;
          $<HTMLSelectElement>("primary").value = primary;
          display(selected);
          button.disabled = false;
        }
        error(reason);
      }
    };
    equipment.items.forEach((item, index) => {
      const choice = document.createElement("button");
      choice.dataset.item = item.id;
      choice.textContent = `0${index + 1} / ${item.label}`;
      choice.disabled = true;
      choice.addEventListener(
        "click",
        () => {
          selected = item.id;
          void equip();
        },
        { signal },
      );
      $("choices").append(choice);
    });
    $("primary").addEventListener(
      "change",
      () => {
        primary = $<HTMLSelectElement>("primary").value as Hand;
        void equip();
      },
      { signal },
    );
    $("weight").addEventListener(
      "input",
      async () => {
        const revision = ++appearance,
          weight = Number($<HTMLInputElement>("weight").value) / 100;
        const next = structuredClone(recipe);
        next.body = { weight };
        try {
          const committed = await avatar.setAppearance(next);
          if (revision === appearance && !closed && committed) {
            recipe.body = { weight };
            avatar.update(time);
          }
        } catch (reason) {
          if (revision === appearance && !closed) {
            $<HTMLInputElement>("weight").value = String(
              (recipe.body?.weight ?? 0) * 100,
            );
            error(reason);
          }
        }
      },
      { signal },
    );
    reduced.checked = matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduced.addEventListener("change", cancel, { signal });
    const press = () => {
      if (!button.disabled) {
        wield.press(primary);
        button.setAttribute("aria-pressed", "true");
      }
    };
    const release = () => {
      wield.release(primary);
      button.setAttribute("aria-pressed", "false");
    };
    button.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.button !== 0 ||
          button.disabled ||
          pointer !== undefined ||
          keyboard ||
          assistive
        )
          return;
        event.preventDefault();
        button.focus({ preventScroll: true });
        pointer = event.pointerId;
        button.setPointerCapture(pointer);
        press();
      },
      { signal },
    );
    button.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId === pointer) {
          pointer = undefined;
          release();
        }
      },
      { signal },
    );
    for (const name of ["pointercancel", "lostpointercapture"] as const)
      button.addEventListener(
        name,
        (event) => {
          if (event.pointerId === pointer) cancel();
        },
        { signal },
      );
    button.addEventListener(
      "keydown",
      (event) => {
        if (![" ", "Enter"].includes(event.key)) return;
        event.preventDefault();
        if (
          !event.repeat &&
          pointer === undefined &&
          !keyboard &&
          !assistive &&
          !button.disabled
        ) {
          keyboard = event.key;
          press();
        }
      },
      { signal },
    );
    button.addEventListener(
      "keyup",
      (event) => {
        if ([" ", "Enter"].includes(event.key)) event.preventDefault();
        if (event.key === keyboard) {
          keyboard = undefined;
          release();
        }
      },
      { signal },
    );
    // Click-only assistive activation toggles; native pointer/keyboard paths remain holds.
    button.addEventListener(
      "click",
      (event) => {
        if (
          event.detail === 0 &&
          !keyboard &&
          pointer === undefined &&
          !button.disabled
        ) {
          assistive = !assistive;
          assistive ? press() : release();
        }
      },
      { signal },
    );
    button.addEventListener("blur", cancel, { signal });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") cancel();
      },
      { signal },
    );
    window.addEventListener("blur", cancel, { signal });
    document.addEventListener(
      "visibilitychange",
      () => {
        cancel();
        wield.setPaused(document.hidden);
        previous = 0;
      },
      { signal },
    );
    document.querySelectorAll<HTMLElement>("[data-view]").forEach((choice) =>
      choice.addEventListener(
        "click",
        () => {
          const view = choice.dataset.view,
            delta =
              view === "top"
                ? new THREE.Vector3(0, 6, 0.001)
                : new THREE.Vector3(
                    view === "side" ? 6 : 0,
                    0.15,
                    view === "back" ? -6 : view === "side" ? 0 : 6,
                  );
          camera.position.copy(orbit.target).add(delta);
          orbit.update();
          for (const cameraButton of document.querySelectorAll<HTMLElement>(
            "[data-view]",
          ))
            cameraButton.setAttribute(
              "aria-pressed",
              String(cameraButton === choice),
            );
        },
        { signal },
      ),
    );
    const resize = () => {
      const width = Math.max(1, $("stage").clientWidth),
        height = Math.max(1, $("stage").clientHeight);
      renderer.setSize(width, height);
      const half = 1.29 / Math.min(1, width / height);
      camera.top = half;
      camera.bottom = -half;
      camera.left = (-half * width) / height;
      camera.right = -camera.left;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe($("stage"));
    cleanup.push(() => observer.disconnect());
    resize();
    const pixels = new THREE.Vector2();
    const animate = (now: number) => {
      if (closed) return;
      const dt = previous
        ? Math.max(0, Math.min(0.05, (now - previous) / 1000))
        : 0;
      previous = now;
      if (!document.hidden) {
        time += dt;
        avatar.update(time, {
          gesture: $<HTMLInputElement>("motion").checked ? "walk" : "idle",
          reducedMotion: reduced.checked,
        });
        style.update(avatar.object, renderer.getDrawingBufferSize(pixels));
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(animate);
    };
    await avatar.setAppearance(recipe);
    if (closed) return;
    await equip();
    if (closed) return;
    for (const control of document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >(".settings input, .settings select, [data-item]"))
      control.disabled = false;
    wield.setPaused(document.hidden);
    raf = requestAnimationFrame(animate);
    (window as any).fieldTools = {
      avatar,
      wield,
      library,
      wieldLibrary,
      renderer,
      camera,
      orbit,
      dispose,
      get recipe() {
        return structuredClone(recipe);
      },
    };
  } catch (reason) {
    error(reason);
    dispose();
  }
}
void start();
