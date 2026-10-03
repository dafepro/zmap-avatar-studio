import "./atelier.css";
import {
  AvatarLibrary,
  WieldLibrary,
  WieldController,
  playfulWieldBehaviors,
  selectedAssets,
  type Catalog,
  type Recipe,
} from "../src";
import { AtelierStage, LookThumbnails } from "./atelier-stage";
import {
  starterLook,
  capsuleChoices,
  parseLook,
  readLooks,
  saveLook,
  PALETTES,
  type Look,
} from "./atelier-state";

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const icons = {
  shape: "◒",
  face: "◡",
  hair: "✦",
  top: "▱",
  bottom: "Ⅱ",
  shoes: "⌁",
  extras: "✧",
  gear: "↗",
};
const categories = [
  {
    id: "body",
    label: "Build",
    icon: icons.shape,
    subtitle: "A silhouette that feels like you.",
  },
  {
    id: "hair",
    label: "Hair",
    icon: icons.hair,
    subtitle: "Strong shapes. Good hair days.",
  },
  {
    id: "shirt",
    label: "Tops",
    icon: icons.top,
    subtitle: "Switch the silhouette. Keep your character.",
  },
  {
    id: "bottom",
    label: "Bottoms",
    icon: icons.bottom,
    subtitle: "Made to move with every build.",
  },
  {
    id: "shoes",
    label: "Kicks",
    icon: icons.shoes,
    subtitle: "Finish strong, from the ground up.",
  },
  {
    id: "extras",
    label: "Extras",
    icon: icons.extras,
    subtitle: "One detail changes the whole look.",
  },
  {
    id: "gear",
    label: "Gear",
    icon: icons.gear,
    subtitle: "Pick a hand. Add a little mischief.",
  },
];
const allowed: Record<string, string[]> = {
  hair: [
    "hair-volt",
    "hair-halo",
    "hair-nova",
    "hair-tide",
    "hair-ember",
    "hair-reed",
  ],
  shirt: [
    "shirt-circuit",
    "shirt-relay",
    "shirt-track",
    "shirt-hoodie",
    "shirt-ember",
    "shirt-tide",
  ],
  bottom: ["bottom-training", "bottom-court"],
  shoes: ["shoes-high", "shoes-runner", "shoes-court"],
  head: ["head-scout", "head-spark"],
  face: [
    "face-volt",
    "face-tide",
    "face-ember",
    "face-grin",
    "face-focus",
    "face-wink",
  ],
  eyewear: ["acc-glasses", "acc-starstruck"],
  accessory: ["acc-headphones", "acc-band", "acc-pulse-pack"],
  headwear: ["hat-club-cap", "hat-quack-captain"],
};
const nameFor: Record<string, string> = {
  "shirt-circuit": "Circuit jacket",
  "shirt-relay": "Relay vest",
  "shirt-track": "Warm-up jacket",
  "shirt-hoodie": "Studio hoodie",
  "shirt-ember": "Ringer tee",
  "shirt-tide": "Court jersey",
  "hair-volt": "Volt crop",
  "hair-halo": "Halo curls",
  "hair-nova": "Nova ponytail",
  "hair-tide": "Tide sweep",
  "hair-ember": "Ember flow",
  "hair-reed": "Reed waves",
  "bottom-training": "Training shorts",
  "bottom-court": "Court shorts",
  "shoes-high": "High tops",
  "shoes-runner": "Pace runners",
  "shoes-court": "Court lows",
};
const root = $("#app");
root.innerHTML = `<header class="topbar"><a class="brand" href="/atelier.html" aria-label="SHIFT character lab"><span class="brand-mark">✳</span><strong>SHIFT<span>CHARACTER LAB</span></strong></a><span class="edition">MODULAR BY DESIGN <i>VOL. 01</i></span><div class="header-actions"><button id="import-look" class="text-button">Import look <span>↓</span></button><button id="export-look" class="outline-button">Export JSON <span>↗</span></button></div></header>
<main><section class="intro"><div><p class="eyebrow">YOUR CHARACTER. YOUR COMBINATIONS.</p><h1>Make your <em>mark.</em><span class="spark">✳</span></h1></div><p class="intro-note">A little attitude. A lot of possibilities.<br>Build a look that moves with you.</p></section>
<section class="workbench"><div class="preview-area"><div class="scene-label"><span class="live-dot"></span> LIVE 3D <span class="scene-label-sep">/</span> <span id="look-title">Signal runner</span></div><div class="preview-actions"><button id="undo" aria-label="Undo last change" title="Undo last change">↶</button><button id="reset" aria-label="Reset look" title="Reset look">↺</button><button id="portrait" aria-label="Download portrait" title="Download portrait">↗</button></div><div class="backdrop-word" aria-hidden="true">SHIFT</div><div class="side-note" aria-hidden="true">BUILT DIFFERENT.<br>BUILT TOGETHER.</div><div id="stage"></div><div class="character-badge"><span>01</span><div><strong id="character-label">SIGNAL RUNNER</strong><small>THE STREET / SPORT CAPSULE</small></div></div><div class="view-controls" aria-label="Camera views"><button data-view="hero" aria-pressed="true">¾</button><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button><button id="turntable" aria-pressed="false" aria-label="Toggle turntable">⟳</button></div><div class="pose-controls" aria-label="Animation preview"><button data-pose="idle" class="active">Idle</button><button data-pose="walk">Walk</button><button data-pose="run">Run</button><button id="wave">Wave ↗</button><button id="pause" aria-label="Pause animation" aria-pressed="false">Ⅱ</button></div><span class="orbit-hint">DRAG TO ORBIT · SCROLL TO ZOOM</span></div>
<aside class="wardrobe"><nav class="category-nav" aria-label="Customization categories">${categories.map((c) => `<button data-category="${c.id}" aria-pressed="${c.id === "shirt"}"><span>${c.icon}</span>${c.label}</button>`).join("")}</nav><div class="wardrobe-inner"><div class="section-heading"><div><p class="eyebrow">THE MIX & MATCH WARDROBE</p><h2 id="category-title">Tops<span> / 03</span></h2></div><span id="item-count" class="count-tag">06 PIECES</span></div><p id="category-description" class="muted">Switch the silhouette. Keep your character.</p><div id="choices"></div><div class="palette-section"><div class="mini-heading"><h3>Set the tone</h3><span>COLORWAYS</span></div><div class="palettes">${PALETTES.map((p, i) => `<button data-palette="${i}" aria-label="${p.name} palette"><span style="--c1:${p.primary};--c2:${p.secondary};--c3:${p.accent}"></span><small>${p.name}</small></button>`).join("")}</div><div class="custom-color"><label for="accent-color">Make it your own</label><input id="accent-color" type="color" aria-label="Custom primary color"><span>PRIMARY COLOR ↗</span></div></div><div class="fit-note"><span>↔</span><p><strong>One rig. Every combination.</strong><br>Clothing follows your build. Gear follows your hands.</p></div></div><footer class="wardrobe-footer"><span id="change-status" role="status" aria-live="polite">Getting your character ready…</span><button id="save-look" class="primary-button">Save look <span>＋</span></button></footer></aside></section>
<section class="shelf"><div class="shelf-title"><p class="eyebrow">START SOMEWHERE. GO ANYWHERE.</p><h2>Your lineup<span>↘</span></h2></div><div id="starter-looks" class="starter-looks"></div><div id="saved-looks" class="saved-looks"></div></section>
<footer class="page-footer"><span><i></i> LOCAL PROTOTYPE · NO ACCOUNT NEEDED</span><details><summary>Under the hood ↗</summary><p id="diagnostics">Same shared skeleton, validated asset bytes and explicit part coverage.</p><p>Original studio and package exports are unchanged. The capsule uses a separate catalog. Saved looks live only in this browser; export JSON to keep a portable copy.</p><a href="/index.html">Open the original studio →</a></details><span>DESIGNED TO BE REMIXED. <b>✳</b></span></footer></main>
<dialog id="save-dialog"><form id="save-form"><p class="eyebrow">ADD TO YOUR LINEUP</p><h2>Give it a name.</h2><p>Saved on this browser, with clothing, colors, build and held gear.</p><label for="look-name">Look name</label><input id="look-name" maxlength="48" required autocomplete="off"><p id="save-error" role="alert"></p><div class="dialog-buttons"><button type="button" id="cancel-save">Cancel</button><button type="submit" class="primary-button">Save look ↗</button></div></form></dialog><input type="file" id="look-file" accept="application/json,.json" hidden><div id="toast" role="alert"></div>`;

let library: AvatarLibrary,
  wieldLibrary: WieldLibrary,
  controller: WieldController,
  stage: AtelierStage,
  thumbnails: LookThumbnails;
let look: Look,
  committed: Look,
  saved: Look[] = [];
let healthy = true;
let category = "shirt",
  extraSlot = "eyewear",
  requested = 0,
  applying = false,
  choiceEpoch = 0;
const history: Look[] = [];
function status(s: string, error = false) {
  $("#change-status").textContent = s;
  $("#change-status").classList.toggle("error", error);
}
let toastTimer = 0;
function toast(s: string) {
  $("#toast").textContent = s;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("#toast").classList.remove("show"),
    5000,
  );
}
function download(data: string, name: string) {
  const a = document.createElement("a");
  a.href = data;
  a.download = name;
  a.click();
}
function exportJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function refreshSummary() {
  $("#look-title").textContent = look.name;
  $("#character-label").textContent = look.name.toUpperCase();
  $<HTMLInputElement>("#accent-color").value = look.appearance.colors.primary;
  document
    .querySelectorAll<HTMLButtonElement>("[data-palette]")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        PALETTES[Number(b.dataset.palette)].primary ===
          look.appearance.colors.primary,
      ),
    );
  $<HTMLButtonElement>("#undo").disabled = !history.length;
  const a = selectedAssets(look.appearance, library.catalog);
  const triangleCount = a.reduce((n, a) => n + a.triangles, 0);
  $("#diagnostics").textContent =
    `${a.length} modular parts · ${triangleCount.toLocaleString()} source triangles · ${library.catalog.rig.sockets.length} shared joints · ${library.catalog.rig.id}. Equipment has its own validated asset budget.`;
}
async function applyLatest() {
  if (applying) return;
  applying = true;
  $<HTMLButtonElement>("#save-look").disabled = true;
  try {
    while (true) {
      const generation = requested,
        candidate = structuredClone(look);
      status("Fitting your look…");
      try {
        await stage.avatar.setAppearance(candidate.appearance);
        await controller.setLoadout(candidate.equipment);
        committed = candidate;
        healthy = true;
        if (generation === requested)
          status("All parts fitted. Ready to move.");
      } catch (e) {
        try {
          if (committed) {
            await stage.avatar.setAppearance(committed.appearance);
            await controller.setLoadout(committed.equipment);
            healthy = true;
          }
        } catch {
          healthy = false;
        }
        if (generation === requested) {
          look = structuredClone(committed);
          refreshSummary();
          renderChoices();
          status(
            healthy
              ? "Could not fit this look. Previous look restored."
              : "Restoring failed. Use Reset to retry before saving.",
            true,
          );
          toast((e as Error).message);
        }
      }
      if (generation === requested) break;
    }
  } finally {
    applying = false;
    $<HTMLButtonElement>("#save-look").disabled = !healthy;
    (window as any).__atelier = {
      get look() {
        return structuredClone(committed);
      },
      get requested() {
        return structuredClone(look);
      },
      get busy() {
        return applying;
      },
      avatar: stage.avatar,
      controller,
      library,
      stage,
    };
  }
}
function edit(change: (next: Look) => void, label = "Custom remix") {
  history.push(structuredClone(look));
  if (history.length > 20) history.shift();
  const next = structuredClone(look);
  change(next);
  next.name = label;
  look = next;
  requested++;
  refreshSummary();
  void applyLatest();
}
function activateLook(next: Look) {
  edit((v) => Object.assign(v, structuredClone(next)), next.name);
  renderChoices();
}
function changePart(slot: string, id: string | null) {
  edit((v) => (v.appearance.parts[slot] = id));
  renderChoices();
}
function thumbFor(
  button: HTMLButtonElement,
  recipe: Recipe,
  slot: string,
  epoch: number,
) {
  void thumbnails
    .render(recipe, slot, () => epoch === choiceEpoch)
    .then((url) => {
      if (!url || epoch !== choiceEpoch || !button.isConnected) return;
      const img = button.querySelector("img");
      if (img) {
        img.src = url;
        img.classList.add("loaded");
      }
    })
    .catch(() => {
      if (button.isConnected)
        button.querySelector(".thumb")?.classList.add("failed");
    });
}
function partGrid(slot: string, host: HTMLElement, optional = false) {
  const ids = allowed[slot] ?? [];
  const assets = capsuleChoices(library.catalog, slot, ids);
  if (slot === "shirt")
    $("#item-count").textContent =
      `${assets.length.toString().padStart(2, "0")} PIECES`;
  const grid = document.createElement("div");
  grid.className = "part-grid";
  host.append(grid);
  const entries = [...(optional ? [null] : []), ...assets];
  for (const asset of entries) {
    const selected = look.appearance.parts[slot] === (asset?.id ?? null),
      b = document.createElement("button");
    b.className = "part-card";
    b.setAttribute("aria-pressed", String(selected));
    b.setAttribute(
      "aria-label",
      asset ? (nameFor[asset.id] ?? asset.label) : `No ${slot}`,
    );
    b.dataset.part = asset?.id ?? "none";
    b.innerHTML = asset
      ? `<span class="thumb"><img alt="" loading="lazy"><span class="selection-check">✓</span>${asset.tags?.includes("shift-capsule") ? '<span class="new-tag">NEW</span>' : ""}</span><span class="part-label"></span><small>${slot === "shirt" ? "SHARED-RIG FIT" : slot === "hair" ? "HEAD SOCKET" : slot === "shoes" ? "FOOT SOCKETS" : "MODULAR PART"}</small>`
      : `<span class="thumb empty">∅<span class="selection-check">✓</span></span><span class="part-label">Keep it simple</span><small>NO ${slot.toUpperCase()}</small>`;
    if (asset)
      b.querySelector(".part-label")!.textContent =
        nameFor[asset.id] ?? asset.label;
    b.onclick = () => changePart(slot, asset?.id ?? null);
    grid.append(b);
    if (asset) {
      const r = structuredClone(look.appearance);
      r.parts[slot] = asset.id;
      thumbFor(b, r, slot, choiceEpoch);
    }
  }
}
function skinControls(host: HTMLElement) {
  const section = document.createElement("section");
  section.className = "body-section";
  section.innerHTML = `<div class="mini-heading"><h3>Build</h3><output id="build-label">${Math.round((look.appearance.body?.weight ?? 0) * 100)}</output></div><input id="body-build" type="range" min="-1" max="1" step="0.05" value="${look.appearance.body?.weight ?? 0}" aria-label="Body build"><div class="range-labels"><span>Lean</span><span>Balanced</span><span>Full</span></div><div class="mini-heading"><h3>Skin tone</h3><span>6 TONES</span></div><div class="skin-swatches"></div><div class="mini-heading"><h3>Expression</h3><span>GRAPHIC / INK</span></div><select id="expression" aria-label="Expression"></select>`;
  host.append(section);
  const slider = section.querySelector<HTMLInputElement>("#body-build")!;
  let buildTimer = 0;
  const commitBuild = () => {
    const weight = Number(slider.value);
    if (weight !== (look.appearance.body?.weight ?? 0))
      edit((v) => (v.appearance.body = { weight }));
  };
  slider.oninput = () => {
    $("#build-label").textContent = String(
      Math.round(Number(slider.value) * 100),
    );
    clearTimeout(buildTimer);
    buildTimer = window.setTimeout(commitBuild, 90);
  };
  slider.onchange = () => {
    clearTimeout(buildTimer);
    commitBuild();
  };
  for (const [i, color] of [
    "#f0c9a5",
    "#dfa577",
    "#bd815b",
    "#9d694b",
    "#754b36",
    "#4c332d",
  ].entries()) {
    const b = document.createElement("button");
    b.className = "skin-swatch";
    b.style.background = color;
    b.setAttribute("aria-label", `Skin tone ${i + 1}`);
    b.setAttribute(
      "aria-pressed",
      String(look.appearance.colors.skin === color),
    );
    b.onclick = () => {
      edit((v) => (v.appearance.colors.skin = color));
      renderChoices();
    };
    section.querySelector(".skin-swatches")!.append(b);
  }
  const expression = section.querySelector<HTMLSelectElement>("#expression")!;
  for (const asset of capsuleChoices(library.catalog, "face", allowed.face))
    expression.add(new Option(asset.label, asset.id));
  expression.value = look.appearance.parts.face!;
  expression.onchange = () => changePart("face", expression.value);
  const h = document.createElement("h3");
  h.textContent = "Face shape";
  h.className = "subsection-title";
  host.append(h);
  partGrid("head", host);
}
function gearControls(host: HTMLElement) {
  const block = document.createElement("div");
  block.className = "gear-controls";
  block.innerHTML = `<div class="gear-illustration"><span>↗</span><strong>GOOD TROUBLE.</strong><small>Real items. Independent hands.</small></div><p class="muted">Swap either hand without changing your outfit. Held items follow the same skeleton while you move.</p>`;
  host.append(block);
  for (const hand of ["left", "right"] as const) {
    const label = document.createElement("label");
    label.className = "gear-label";
    label.textContent = hand === "left" ? "Left hand" : "Right hand";
    const select = document.createElement("select");
    select.setAttribute("aria-label", label.textContent);
    select.id = `gear-${hand}`;
    select.add(new Option("Empty hand", ""));
    for (const item of wieldLibrary.catalog.items)
      select.add(new Option(item.label, item.id));
    select.value = look.equipment[hand] ?? "";
    select.onchange = () => {
      edit((v) => (v.equipment[hand] = select.value || null));
    };
    label.append(select);
    block.append(label);
  }
  const action = document.createElement("button");
  action.className = "gear-use";
  action.textContent = "Try held gear ↗";
  action.onclick = () => {
    for (const h of ["left", "right"] as const) controller.press(h);
    setTimeout(() => {
      for (const h of ["left", "right"] as const) controller.release(h);
    }, 900);
  };
  block.append(action);
}
function renderChoices() {
  choiceEpoch++;
  const c = categories.find((c) => c.id === category)!;
  $("#category-title").replaceChildren(document.createTextNode(c.label));
  const n = document.createElement("span");
  n.textContent = ` / 0${categories.indexOf(c) + 1}`;
  $("#category-title").append(n);
  $("#category-description").textContent = c.subtitle;
  $("#item-count").textContent =
    category === "body"
      ? "YOUR BASE"
      : category === "gear"
        ? "2 HANDS"
        : "SWAP FREELY";
  document
    .querySelectorAll<HTMLElement>("[data-category]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.category === category)),
    );
  const choices = $("#choices");
  choices.replaceChildren();
  if (category === "body") skinControls(choices);
  else if (category === "gear") gearControls(choices);
  else if (category === "extras") {
    const nav = document.createElement("div");
    nav.className = "extra-tabs";
    for (const [id, label] of [
      ["eyewear", "Glasses"],
      ["headwear", "Hats"],
      ["accessory", "Accessories"],
    ]) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-pressed", String(extraSlot === id));
      b.onclick = () => {
        extraSlot = id;
        renderChoices();
      };
      nav.append(b);
    }
    choices.append(nav);
    partGrid(extraSlot, choices, true);
  } else partGrid(category, choices);
}
function renderShelf() {
  const starter = $("#starter-looks");
  starter.replaceChildren();
  [0, 1, 2].forEach((i) => {
    const b = document.createElement("button");
    const l = starterLook(library.catalog, wieldLibrary.catalog, i);
    b.className = "starter-card";
    b.style.setProperty("--swatch", PALETTES[i].primary);
    b.innerHTML = `<span class="starter-number">0${i + 1}</span><span><strong>${l.name}</strong><small>${["STREET / SPORT", "AFTER HOURS", "WARM-UP CLUB"][i]}</small></span><span class="starter-arrow">↗</span>`;
    b.onclick = () => activateLook(l);
    starter.append(b);
  });
  const shelf = $("#saved-looks");
  shelf.replaceChildren();
  for (const l of saved) {
    const b = document.createElement("button");
    b.className = "saved-card";
    b.textContent = `☆ ${l.name}`;
    b.onclick = () => activateLook(l);
    shelf.append(b);
  }
  if (!saved.length)
    shelf.innerHTML =
      '<span class="shelf-empty">YOUR REMIX GOES HERE<br><small>Save a look to build your lineup.</small></span>';
}
async function init() {
  const response = await fetch("/capsule/catalog.json");
  if (!response.ok) throw new Error("The capsule catalog could not load");
  const catalog: Catalog = await response.json();
  library = new AvatarLibrary(
    catalog,
    new URL("/capsule/", location.href).href,
  );
  wieldLibrary = new WieldLibrary(
    await fetch("/wield/catalog.json").then((r) => r.json()),
    new URL("/wield/", location.href).href,
  );
  const avatar = library.create();
  stage = new AtelierStage($("#stage"), avatar);
  controller = new WieldController(
    avatar,
    wieldLibrary,
    playfulWieldBehaviors(),
  );
  thumbnails = new LookThumbnails(library);
  look = starterLook(catalog, wieldLibrary.catalog);
  committed = structuredClone(look);
  try {
    saved = readLooks(localStorage, catalog, wieldLibrary.catalog);
  } catch {
    toast("Saved looks could not be read. You can still customize and export.");
  }
  refreshSummary();
  await applyLatest();
  renderChoices();
  renderShelf();
  document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach(
    (b) =>
      (b.onclick = () => {
        category = b.dataset.category!;
        renderChoices();
      }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-palette]").forEach(
    (b) =>
      (b.onclick = () => {
        edit((v) => {
          const { name, ...colors } = PALETTES[Number(b.dataset.palette)];
          Object.assign(v.appearance.colors, colors);
        });
        renderChoices();
      }),
  );
  $<HTMLInputElement>("#accent-color").onchange = (e) => {
    edit(
      (v) =>
        (v.appearance.colors.primary = (e.target as HTMLInputElement).value),
    );
    renderChoices();
  };
  $("#undo").onclick = () => {
    const prev = history.pop();
    if (prev) {
      look = prev;
      requested++;
      refreshSummary();
      renderChoices();
      void applyLatest();
    }
  };
  $("#reset").onclick = () =>
    activateLook(starterLook(catalog, wieldLibrary.catalog));
  $("#export-look").onclick = () => {
    if (applying || !healthy) {
      toast(
        healthy
          ? "Wait a moment while the new look fits"
          : "Use Reset to restore the avatar before exporting",
      );
      return;
    }
    exportJson(
      committed,
      `${committed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.shift.json`,
    );
    toast("Your look is exported, including held gear");
  };
  $("#portrait").onclick = () => {
    download(stage.portrait(), "shift-portrait.png");
    toast("Portrait downloaded");
  };
  $("#import-look").onclick = () => $<HTMLInputElement>("#look-file").click();
  $<HTMLInputElement>("#look-file").onchange = async (e) => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    try {
      if (file) {
        if (file.size > 32768)
          throw new Error("Look files must be smaller than 32 KB");
        activateLook(
          parseLook(await file.text(), catalog, wieldLibrary.catalog),
        );
      }
    } catch (e) {
      toast(`Import stopped: ${(e as Error).message}`);
    } finally {
      input.value = "";
    }
  };
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        stage.view(b.dataset.view as any);
        document
          .querySelectorAll("[data-view]")
          .forEach((el) => el.setAttribute("aria-pressed", String(el === b)));
      }),
  );
  $("#turntable").onclick = () => {
    stage.turning = !stage.turning;
    $("#turntable").setAttribute("aria-pressed", String(stage.turning));
  };
  document.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach(
    (b) =>
      (b.onclick = () => {
        avatar.cancelEmote();
        stage.pose = b.dataset.pose as any;
        document
          .querySelectorAll("[data-pose]")
          .forEach((el) => el.classList.toggle("active", el === b));
      }),
  );
  $("#wave").onclick = () => {
    if (stage.paused) {
      toast("Resume animation to wave");
      return;
    }
    avatar.playEmote("wave");
  };
  $("#pause").setAttribute("aria-pressed", String(stage.paused));
  $("#pause").onclick = () => {
    stage.paused = !stage.paused;
    $("#pause").setAttribute("aria-pressed", String(stage.paused));
    $("#pause").textContent = stage.paused ? "▶" : "Ⅱ";
    $("#pause").setAttribute(
      "aria-label",
      stage.paused ? "Resume animation" : "Pause animation",
    );
  };
  const dialog = $<HTMLDialogElement>("#save-dialog");
  $("#save-look").onclick = () => {
    $<HTMLInputElement>("#look-name").value = look.name;
    $("#save-error").textContent = "";
    dialog.showModal();
    $<HTMLInputElement>("#look-name").select();
  };
  $("#cancel-save").onclick = () => dialog.close();
  $("#save-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const next = structuredClone(committed);
      next.name = $<HTMLInputElement>("#look-name").value.trim();
      if (!next.name) throw new Error("Give this look a name");
      saved = saveLook(localStorage, saved, next);
      look = next;
      committed = structuredClone(next);
      refreshSummary();
      renderShelf();
      dialog.close();
      toast(`Saved “${next.name}” to your lineup`);
    } catch (e) {
      $("#save-error").textContent = (e as Error).message;
    }
  };
  addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    controller.dispose();
    thumbnails.dispose();
    stage.dispose();
    avatar.dispose();
    library.dispose();
    wieldLibrary.dispose();
  });
}
void init().catch((e) => {
  status("The studio could not start. Reload to retry.", true);
  toast((e as Error).message);
  console.error(e);
});
