import {
  WieldLibrary,
  WieldController,
  playfulWieldBehaviors,
  emptyWieldLoadout,
  type AvatarInstance,
  type Hand,
  type WieldLoadout,
} from "../src";

const actions: Record<string, string> = {
  "bubble-comet": "Make bubbles",
  "bonk-bouquet": "Bonk!",
  "firefly-lantern": "Toggle light",
  "doodle-rocket": "Draw in the air",
  "whirl-pop": "Spin the candy",
};

/** This studio consumes the public equipment API, exactly as another app can. */
export async function mountWieldPanel(
  avatar: AvatarInstance,
  onChange: () => void,
  lifecycle?: AbortSignal,
) {
  const panel = document.createElement("section");
  panel.id = "wield-panel";
  panel.className = "wield-panel";
  panel.innerHTML = `<div><p class="eyebrow">A LITTLE MISCHIEF</p><h2>Put your hands to good use.</h2><p>One toy. Either hand. Or mix a pair.</p></div><div class="wield-choices"></div><div class="wield-bottom"><button id="wield-demo">Try a playful pair</button><button id="wield-clear">Empty both hands</button><a href="/wield.html">Open the toy playground ↗</a><p id="wield-status" role="status">Loading the toy collection…</p></div>`;
  document.querySelector(".saved-section")!.before(panel);
  const feedback = panel.querySelector<HTMLElement>("#wield-status")!;
  const response = await fetch("/wield/catalog.json", { signal: lifecycle });
  if (!response.ok) {
    feedback.textContent =
      "The toy collection could not load. Reload to retry.";
    throw new Error("Wield catalog could not load");
  }
  const manifest = await response.json();
  lifecycle?.throwIfAborted();
  const library = new WieldLibrary(
    manifest,
    new URL("/wield/", location.href).href,
  );
  const controller = new WieldController(
    avatar,
    library,
    playfulWieldBehaviors(),
    {
      onEvent(event) {
        if (event.type === "light")
          feedback.textContent = `${event.hand === "left" ? "Left" : "Right"} lantern ${event.value ? "on" : "off"}.`;
        else if (event.type === "bonk")
          feedback.textContent = "Bonk! A little flower power.";
      },
      onError(error) {
        feedback.textContent = `Toy action stopped: ${String((error as Error).message)}`;
        refresh();
      },
    },
  );
  const buttons = document.createElement("div");
  buttons.className = "wield-use-controls";
  buttons.setAttribute("aria-label", "Use held items");
  document.querySelector(".preview")!.append(buttons);
  const selects = {} as Record<Hand, HTMLSelectElement>,
    use = {} as Record<Hand, HTMLButtonElement>;
  const displayed = new Map<Hand, unknown>();
  let pending: WieldLoadout | undefined,
    generation = 0,
    closed = false,
    inspected = false,
    frozen = false;
  const signal = new AbortController();
  function refresh() {
    const loadout = pending ?? controller.loadout;
    for (const hand of ["left", "right"] as const) {
      selects[hand].value = loadout[hand] ?? "";
      const held = controller.getHand(hand),
        action = held && actions[held.item.behavior];
      if (displayed.get(hand) !== held || held?.state === "error")
        use[hand].setAttribute("aria-pressed", "false");
      displayed.set(hand, held);
      use[hand].textContent =
        `${hand === "left" ? "Q · Left" : "E · Right"} · ${action ?? "Empty hand"}`;
      use[hand].disabled =
        !held || held.state !== "ready" || inspected || frozen;
    }
  }
  async function equip(next: WieldLoadout) {
    const request = ++generation;
    pending = structuredClone(next);
    feedback.textContent = "Getting your toys ready…";
    refresh();
    try {
      if (await controller.setLoadout(next)) {
        feedback.textContent =
          "Hold Q / E, or the buttons beside your avatar. The lantern toggles with a tap.";
        onChange();
      }
    } catch (error) {
      if (request === generation)
        feedback.textContent = `Could not equip: ${(error as Error).message}. Your previous items are still ready.`;
    } finally {
      if (request === generation) {
        pending = undefined;
        refresh();
      }
    }
  }
  for (const hand of ["left", "right"] as const) {
    const label = document.createElement("label");
    label.textContent = hand === "left" ? "Left hand" : "Right hand";
    const select = document.createElement("select");
    select.id = `wield-${hand}`;
    select.setAttribute("aria-label", label.textContent);
    select.append(new Option("Empty hand", ""));
    for (const item of library.catalog.items)
      select.append(new Option(item.label, item.id));
    selects[hand] = select;
    label.append(select);
    panel.querySelector(".wield-choices")!.append(label);
    select.onchange = () => {
      const next = structuredClone(pending ?? controller.loadout);
      next[hand] = select.value || null;
      void equip(next);
    };
    const button = document.createElement("button");
    button.id = `wield-use-${hand}`;
    button.className = "wield-use";
    use[hand] = button;
    buttons.append(button);
    let pointer: number | undefined;
    button.addEventListener(
      "pointerdown",
      (event) => {
        if (pointer !== undefined || event.button !== 0 || button.disabled)
          return;
        pointer = event.pointerId;
        button.setPointerCapture(pointer);
        controller.press(hand);
        button.setAttribute("aria-pressed", "true");
      },
      { signal: signal.signal },
    );
    const release = () => {
      pointer = undefined;
      controller.release(hand);
      button.setAttribute("aria-pressed", "false");
    };
    button.addEventListener("pointerup", release, { signal: signal.signal });
    button.addEventListener("lostpointercapture", release, {
      signal: signal.signal,
    });
    button.addEventListener(
      "pointercancel",
      () => {
        pointer = undefined;
        controller.cancel(hand);
        button.setAttribute("aria-pressed", "false");
      },
      { signal: signal.signal },
    );
    button.addEventListener(
      "keydown",
      (event) => {
        if (![" ", "Enter"].includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat && !button.disabled) {
          controller.press(hand);
          button.setAttribute("aria-pressed", "true");
        }
      },
      { signal: signal.signal },
    );
    button.addEventListener(
      "keyup",
      (event) => {
        if (![" ", "Enter"].includes(event.key)) return;
        event.preventDefault();
        release();
      },
      { signal: signal.signal },
    );
    // Assistive activation has no pointer/key duration. Continuous actions toggle
    // until activated again; physical Space/Enter still acts as a held button.
    button.addEventListener(
      "click",
      (event) => {
        if (event.detail !== 0 || button.disabled) return;
        const behavior = controller.getHand(hand)?.item.behavior;
        const continuous = [
          "bubble-comet",
          "doodle-rocket",
          "whirl-pop",
        ].includes(behavior ?? "");
        if (continuous && button.getAttribute("aria-pressed") === "true")
          release();
        else {
          controller.press(hand);
          button.setAttribute("aria-pressed", "true");
          if (!continuous) release();
        }
      },
      { signal: signal.signal },
    );
  }
  const cancel = () => {
    controller.cancel();
    for (const button of Object.values(use))
      button.setAttribute("aria-pressed", "false");
  };
  const keyHand = (key: string): Hand | undefined =>
    key.toLowerCase() === "q"
      ? "left"
      : key.toLowerCase() === "e"
        ? "right"
        : undefined;
  window.addEventListener(
    "keydown",
    (event) => {
      const hand = keyHand(event.key),
        target = event.target as HTMLElement | null;
      if (
        !hand ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target?.closest(
          "input,select,textarea,dialog,[contenteditable=true]",
        ) ||
        use[hand].disabled
      )
        return;
      event.preventDefault();
      controller.press(hand);
      use[hand].setAttribute("aria-pressed", "true");
    },
    { signal: signal.signal },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      const hand = keyHand(event.key);
      if (hand) {
        controller.release(hand);
        use[hand].setAttribute("aria-pressed", "false");
      }
    },
    { signal: signal.signal },
  );
  window.addEventListener("blur", cancel, { signal: signal.signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      controller.setPaused(document.hidden || inspected || frozen);
      if (document.hidden) cancel();
    },
    { signal: signal.signal },
  );
  panel.querySelector<HTMLButtonElement>("#wield-demo")!.onclick = () =>
    void equip({
      ...emptyWieldLoadout(library.catalog),
      left: "wield-firefly-lantern",
      right: "wield-bubble-comet",
    });
  panel.querySelector<HTMLButtonElement>("#wield-clear")!.onclick = () =>
    void equip(emptyWieldLoadout(library.catalog));
  feedback.textContent =
    "Choose something for either hand. Held items are separate from your saved wardrobe.";
  refresh();
  return {
    controller,
    library,
    setInspection(value: boolean) {
      inspected = value;
      controller.setVisible(!value);
      controller.setPaused(value || document.hidden || frozen);
      buttons.hidden = value;
      refresh();
    },
    setFrozen(value: boolean) {
      frozen = value;
      if (value) cancel();
      controller.setPaused(value || inspected || document.hidden);
      refresh();
    },
    dispose() {
      if (closed) return;
      closed = true;
      signal.abort();
      controller.dispose();
      library.dispose();
      buttons.remove();
      panel.remove();
    },
  };
}
