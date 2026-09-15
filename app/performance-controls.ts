import {
  emoteDescriptors,
  type AvatarInstance,
  type WieldController,
  type Hand,
  type EmoteId,
} from "../src/index.js";
import "./performance-controls.css";

/** Uses only public avatar/wield APIs; selection survives stow and expressive clips. */
export function mountPerformanceControls(
  avatar: AvatarInstance,
  wield: WieldController,
  container: HTMLElement,
  options: {
    signal: AbortSignal;
    beforeEmote?: () => void;
    onRefresh?: () => void;
  },
) {
  const panel = document.createElement("section");
  panel.className = "performance-controls";
  panel.setAttribute("aria-label", "Expressions and equipment transitions");
  panel.innerHTML = `<h2>Make it a moment.</h2><div class="performance-emotes" role="group" aria-label="Expressions">${emoteDescriptors.map(({ id, label }) => `<button data-performance-emote="${id}" aria-pressed="false">${label}</button>`).join("")}</div><p class="performance-status" role="status">Your hands clear themselves for an expression.</p><div class="performance-equipment" role="group" aria-label="Draw and stow selected items"><button data-performance-hand="left">Stow left</button><button data-performance-hand="right">Stow right</button><button data-performance-hand="both">Stow tool</button><button data-performance-stop>Stop expression</button></div><small>Stowing keeps your selection. Your items return when the expression ends.</small>`;
  container.append(panel);
  const buttons = [
    ...panel.querySelectorAll<HTMLButtonElement>("[data-performance-hand]"),
  ];
  const stop = panel.querySelector<HTMLButtonElement>(
    "[data-performance-stop]",
  )!;
  const status = panel.querySelector<HTMLElement>(".performance-status")!;
  let closed = false;
  const refresh = () => {
    if (closed || wield.state === "disposed") return;
    const current = avatar.animationDiagnostics().emote;
    const presentation = wield.diagnostics().presentation;
    const two = !!wield.loadout.twoHanded;
    for (const button of buttons) {
      const hand = button.dataset.performanceHand as Hand | "both";
      button.hidden = hand === "both" ? !two : two;
      const side = hand === "both" ? "right" : hand;
      const phase = presentation[side]?.phase;
      const transitional = phase === "drawing" || phase === "stowing";
      button.disabled =
        wield.state !== "ready" || !wield.getHand(side) || transitional;
      button.textContent = `${phase === "holstered" ? "Draw" : phase === "drawing" ? "Drawing" : phase === "stowing" ? "Stowing" : "Stow"} ${hand === "both" ? "tool" : hand}`;
      button.setAttribute("aria-pressed", String(phase === "holstered"));
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>(
      "[data-performance-emote]",
    )) {
      button.disabled = wield.state !== "ready";
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.performanceEmote === current?.id),
      );
    }
    stop.disabled = !current;
    status.textContent = current
      ? current.waiting
        ? "Stowing your selection before the expression…"
        : `${emoteDescriptors.find((entry) => entry.id === current.id)!.label} · ${current.elapsed.toFixed(1)} s`
      : Object.values(presentation).some((entry) => entry.phase === "drawing")
        ? "Drawing your selection back into your hands…"
        : "Choose an expression, or practice drawing and stowing.";
    options.onRefresh?.();
  };
  panel.addEventListener(
    "click",
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button",
      );
      if (!button || button.disabled) return;
      if (button.dataset.performanceEmote) {
        options.beforeEmote?.();
        avatar.playEmote(button.dataset.performanceEmote as EmoteId);
      } else if (button.hasAttribute("data-performance-stop"))
        avatar.cancelEmote();
      else if (button.dataset.performanceHand) {
        avatar.cancelEmote();
        const hand = button.dataset.performanceHand as Hand | "both";
        wield.setDrawn(
          !wield.isDrawn(hand === "both" ? undefined : hand),
          hand === "both" ? {} : { hand },
        );
      }
      refresh();
    },
    { signal: options.signal },
  );
  const timer = setInterval(refresh, 100);
  const dispose = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    panel.remove();
  };
  options.signal.addEventListener("abort", dispose, { once: true });
  if (options.signal.aborted) dispose();
  else refresh();
  return { dispose, refresh };
}
