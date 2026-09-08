import "./style.css";
import {
  AvatarLibrary,
  defaultRecipe,
  parseRecipe,
  selectedAssets,
  recipeKey,
  type Recipe,
  type Catalog,
  type Motion,
} from "../src";
import { Stage, Thumbnails } from "./stage";
import { mountWieldPanel } from "./wield-panel";
let wieldPanel: Awaited<ReturnType<typeof mountWieldPanel>> | undefined;
const wieldLifecycle = new AbortController();
const icons: Record<string, string> = {
  head: "◉",
  face: "⌣",
  hair: "≋",
  shirt: "♧",
  bottom: "Ⅱ",
  shoes: "⌁",
  facialHair: "⌁",
  eyewear: "∞",
  headwear: "◒",
  accessory: "◎",
  effect: "✧",
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
document.querySelector("#app")!.innerHTML =
  `<header class="topbar"><a class="brand" href="/"><span class="brand-symbol">a<span>✳</span></span><span>avatar studio<small>BY ZOOMAP</small></span></a><span class="project-label">THE ATHLETICS COLLECTION <span>01</span></span><div class="header-actions"><button id="try-accessories" class="quiet">Try accessories</button><button id="reference" class="quiet">Study sheet</button><button id="import" class="quiet">↥ Import look</button><button id="export" class="dark">Export look <span>↗</span></button></div></header>
<main><section class="intro"><div><p class="eyebrow">A LITTLE CHARACTER. A LOT OF YOU.</p><h1>Make it yours<span>.</span></h1></div><p>Mix the pieces. Find your people.<br>Built to move with you.</p></section>
<div class="studio"><nav id="categories" class="categories" aria-label="Avatar categories"><span class="eyebrow">THE DETAILS</span></nav>
<section class="preview" aria-label="Avatar design preview"><div class="style-controls" role="group" aria-label="Render style"><button id="soft-style" aria-pressed="false">Studio</button><button id="comic-style" aria-pressed="true">Illustrated</button></div><div class="projection-tools"><button id="capture-views">16-view drawing</button><button id="live-view" hidden>Back to live 3D</button><button id="export-views" hidden>Export views</button><span id="projection-note" hidden>Frozen pose · 22.5° steps</span></div><div class="preview-top"><span class="collection-chip"><i></i> ATHLETICS / 01</span><div class="history"><button id="undo" aria-label="Undo change" title="Undo">↶</button><button id="redo" aria-label="Redo change" title="Redo">↷</button></div></div><div class="stage-art"><span class="orbit-ring"></span><span class="stage-number">YOU,<br>IN EVERY<br>DETAIL.</span></div><div id="stage"></div><div id="loading" class="loading">Preparing your studio…</div><div class="view-controls" role="group" aria-label="Camera views"><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button><button id="turntable" aria-pressed="false" title="Rotate avatar">⟳</button></div><div class="preview-bottom"><div class="pose-controls" role="group" aria-label="Animation preview"><button data-pose="idle" aria-pressed="true">Stand</button><button data-pose="walk" aria-pressed="false">Walk</button><button data-pose="wave" aria-pressed="false">Wave</button><button data-pose="run" aria-pressed="false">Run</button></div><button id="photo" class="photo" title="Download transparent PNG">↧ <span>Portrait</span></button></div></section>
<aside class="inspector"><div class="inspector-heading"><p class="eyebrow">YOUR WARDROBE</p><h2 id="category-title">Head</h2><p id="category-description">A familiar face starts here.</p></div><div id="parts" class="parts" role="group" aria-label="Available parts"></div><div class="palette-heading"><h3>Make it personal</h3><span>COLOR STUDY</span></div><div id="colors" class="colors"></div><div class="look-note"><span>✳</span><p>Same player. Endless possibilities.<small>Your look is saved on this device.</small></p></div></aside></div>
<section class="saved-section"><div><p class="eyebrow">YOUR STARTING LINEUP</p><h2>Good looks, on repeat.</h2></div><div id="collection-presets" class="presets"></div><div id="presets" class="presets"></div><button id="save-look" class="save-look">＋ Save this look</button></section>
<footer><p id="status" role="status" aria-live="polite">Starting studio…</p><div><label><input id="reduced" type="checkbox"> Less motion</label><label><input id="scale" type="checkbox"> World scale</label><details><summary>Kit details</summary><pre id="stats"></pre></details></div></footer></main>
<dialog id="reference-dialog"><button id="close-reference" class="dark">Back to my avatar</button><h2>The character study</h2><p>Our visual reference for proportions, expression, silhouettes and sportswear.</p><div id="reference-image"></div></dialog><input type="file" id="file" accept=".json,application/json" hidden><dialog id="save-dialog"><form method="dialog"><p class="eyebrow">SAVE TO YOUR LINEUP</p><h2>Give this look a name.</h2><label>Name<input id="look-name" maxlength="32" required placeholder="Weekend captain"></label><div><button value="cancel" formnovalidate>Cancel</button><button id="confirm-save" value="save" class="dark">Save look</button></div></form></dialog>`;
$("colors").insertAdjacentHTML(
  "afterend",
  `<div id="body-shape" class="body-shape"><label for="weight">Build <output id="weight-value">Study</output></label><input id="weight" type="range" min="-100" max="100" step="5" value="0" aria-label="Body weight"><div><span>Lean</span><span>Study</span><span>Heavier</span></div></div>`,
);
$("body-shape").insertAdjacentHTML(
  "afterend",
  `<div class="component-views" role="group" aria-label="Component inspection"><button data-inspect="avatar" aria-pressed="true">Avatar</button><button data-inspect="base" aria-pressed="false">Base mesh</button><button data-inspect="hair" aria-pressed="false">Hair</button><button data-inspect="outfit" aria-pressed="false">Outfit</button></div>`,
);
document.querySelectorAll<HTMLButtonElement>("[data-inspect]").forEach(
  (button) =>
    (button.onclick = () => {
      wieldPanel?.setInspection(button.dataset.inspect !== "avatar");
      stage.inspect(
        button.dataset.inspect as "avatar" | "base" | "hair" | "outfit",
        catalog,
      );
      document
        .querySelectorAll("[data-inspect]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      $<HTMLButtonElement>("capture-views").disabled =
        button.dataset.inspect !== "avatar";
    }),
);
let weightFrame = 0;
$("weight").oninput = () => {
  const value = Number($<HTMLInputElement>("weight").value) / 100;
  $("weight-value").textContent =
    value === 0 ? "Study" : `${value > 0 ? "+" : ""}${Math.round(value * 100)}`;
  cancelAnimationFrame(weightFrame);
  weightFrame = requestAnimationFrame(
    () => void apply({ ...(draft ?? recipe), body: { weight: value } }),
  );
};
let library: AvatarLibrary,
  stage: Stage,
  thumbs: Thumbnails,
  catalog: Catalog,
  recipe: Recipe,
  category = "head",
  busy = 0,
  galleryGeneration = 0;
let history: Recipe[] = [],
  future: Recipe[] = [];
let draft: Recipe | undefined;
const descriptions: Record<string, string> = {
  head: "Start with a silhouette that feels like you.",
  face: "A little expression goes a long way.",
  hair: "Find your signature silhouette.",
  shirt: "Ready for the court. Or the weekend.",
  bottom: "A little room to move.",
  shoes: "Start from the ground up.",
  facialHair: "A little character, shaped to your face.",
  eyewear: "Frames that follow your features.",
  headwear: "Your hair. Your hat. A comfortable fit.",
  accessory: "The small things make it yours.",
  effect: "A quiet spark of personality.",
};
const colors: Record<string, string[]> = {
  skin: ["#edc39d", "#c68b60", "#a76943", "#855538", "#593c30"],
  primary: ["#782e43", "#e7dfcc", "#d29339", "#496d65", "#34383c", "#536780"],
  secondary: ["#263b3c", "#782e43", "#e0d6bd", "#47597c"],
  trim: ["#f4ead7", "#263b3c", "#d9a342"],
  hair: ["#312821", "#171d23", "#75442c", "#c89144", "#ddd1b9"],
  iris: ["#554030", "#44665b", "#527990", "#26282b"],
  accent: ["#d9a342", "#782e43", "#8caaa0", "#e2c5ac"],
};
const defaults: Record<string, string> = {
  skin: "#d3a17a",
  primary: "#f4f1eb",
  secondary: "#292b2d",
  trim: "#f5f2eb",
  hair: "#594333",
  iris: "#554030",
  accent: "#d9a342",
};
function status(text: string, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function remember() {
  try {
    localStorage.setItem("avatar-studio:current", JSON.stringify(recipe));
    return true;
  } catch {
    return false;
  }
}
async function apply(next: Recipe, record = true) {
  const token = ++busy;
  draft = structuredClone(next);
  $("undo").setAttribute("disabled", "");
  $("redo").setAttribute("disabled", "");
  status("Fitting your new look…");
  try {
    const previous = recipe;
    const applied = await stage.avatar.setAppearance(next);
    if (!applied || token !== busy) return;
    if (record && previous && recipeKey(previous) !== recipeKey(next)) {
      history.push(previous);
      history = history.slice(-50);
      future = [];
    }
    recipe = structuredClone(next);
    draft = undefined;
    const saved = remember();
    renderControls();
    status(
      saved
        ? "Looking good. Saved on this device."
        : "Look updated. This browser could not save it locally. Export a copy.",
      !saved,
    );
    $("loading").hidden = true;
  } catch (e) {
    if (token === busy) {
      draft = undefined;
      renderControls();
      status((e as Error).message, true);
    }
  }
}
function renderControls() {
  $("body-shape").hidden = !catalog.bodyShape;
  $<HTMLInputElement>("weight").value = String(
    Math.round((recipe.body?.weight ?? 0) * 100),
  );
  $("weight-value").textContent = !recipe.body?.weight
    ? "Study"
    : `${recipe.body.weight > 0 ? "+" : ""}${Math.round(recipe.body.weight * 100)}`;
  $("undo").toggleAttribute("disabled", !history.length);
  $("redo").toggleAttribute("disabled", !future.length);
  document
    .querySelectorAll<HTMLButtonElement>("[data-part]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String((recipe.parts[category] ?? "") === b.dataset.part),
      ),
    );
  renderColors();
  const assets = selectedAssets(recipe, catalog);
  $("stats").textContent =
    `Rig ${catalog.rig.id}\n${assets.length} selected parts · ${stage.avatar.diagnostics().sourceTriangles.toLocaleString()} fitted triangles\n${(assets.reduce((n, a) => n + a.bytes, 0) / 1000).toFixed(0)} KB selected assets\nCatalog ${catalog.revision} · original Blender meshes`;
}
function renderColors() {
  const asset = catalog.assets.find((a) => a.id === recipe.parts[category]);
  const channels = asset?.channels ?? [];
  const holder = $("colors");
  holder.replaceChildren();
  for (const channel of channels) {
    const row = document.createElement("div");
    row.className = "color-row";
    const label = document.createElement("span");
    label.textContent = channel[0].toUpperCase() + channel.slice(1);
    row.append(label);
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    for (const value of colors[channel] ?? [defaults[channel] ?? "#ffffff"]) {
      const b = document.createElement("button");
      b.style.setProperty("--swatch", value);
      b.title = `${channel} ${value}`;
      b.setAttribute("aria-label", `${channel} ${value}`);
      b.setAttribute(
        "aria-pressed",
        String((recipe.colors[channel] ?? defaults[channel]) === value),
      );
      b.onclick = () =>
        void apply({
          ...(draft ?? recipe),
          colors: { ...(draft ?? recipe).colors, [channel]: value },
        });
      swatches.append(b);
    }
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = recipe.colors[channel] ?? defaults[channel] ?? "#ffffff";
    picker.setAttribute("aria-label", `Custom ${channel} color`);
    picker.onchange = () =>
      void apply({
        ...(draft ?? recipe),
        colors: { ...(draft ?? recipe).colors, [channel]: picker.value },
      });
    swatches.append(picker);
    row.append(swatches);
    holder.append(row);
  }
  if (!channels.length)
    holder.textContent = "Choose a part to explore its colors.";
}
function gallery() {
  const generation = ++galleryGeneration;
  const slot = catalog.slots.find((s) => s.id === category)!;
  $("category-title").textContent = slot.label;
  $("category-description").textContent =
    descriptions[category] ?? "Add your own detail.";
  document
    .querySelectorAll("[data-category]")
    .forEach((b) =>
      b.setAttribute(
        "aria-current",
        String((b as HTMLElement).dataset.category === category),
      ),
    );
  const holder = $("parts");
  holder.replaceChildren();
  const assets = catalog.assets.filter((a) => a.slot === category);
  const entries = slot.required ? assets : [null, ...assets];
  for (const asset of entries) {
    const b = document.createElement("button");
    b.className = "part-card";
    b.dataset.part = asset?.id ?? "";
    b.setAttribute(
      "aria-pressed",
      String(recipe.parts[category] === (asset?.id ?? null)),
    );
    b.setAttribute(
      "aria-label",
      asset?.label ?? `No ${slot.label.toLowerCase()}`,
    );
    const picture = document.createElement("div");
    picture.className = "part-picture";
    picture.textContent = asset ? "·" : "—";
    const label = document.createElement("strong");
    label.textContent = asset?.label ?? "Keep it simple";
    const check = document.createElement("span");
    check.className = "part-check";
    check.textContent = "✓";
    b.append(picture, label, check);
    const selectedCategory = category;
    b.onclick = () =>
      void apply({
        ...(draft ?? recipe),
        parts: {
          ...(draft ?? recipe).parts,
          [selectedCategory]: asset?.id ?? null,
        },
      });
    holder.append(b);
    if (asset) {
      const next = {
        ...recipe,
        parts: { ...recipe.parts, [category]: asset.id },
      };
      void thumbs
        .render(next, category)
        .then((url) => {
          if (generation !== galleryGeneration) return;
          const img = new Image();
          img.alt = "";
          img.src = url;
          picture.replaceChildren(img);
        })
        .catch(() => {
          if (generation === galleryGeneration)
            picture.textContent = "Preview unavailable";
        });
    }
  }
  renderColors();
}
type Saved = { name: string; recipe: Recipe };
let saved: Saved[] = [],
  hasSavedRecord = false;
function readSaved() {
  try {
    const raw = localStorage.getItem("avatar-studio:looks");
    hasSavedRecord = raw !== null;
    const input = JSON.parse(raw ?? "[]");
    if (!Array.isArray(input) || input.length > 12) return;
    saved = input
      .filter((v) => typeof v.name === "string" && v.name.length <= 32)
      .flatMap((v) => {
        try {
          return [
            {
              name: v.name,
              recipe: parseRecipe(JSON.stringify(v.recipe), catalog),
            },
          ];
        } catch {
          return [];
        }
      });
  } catch {}
}
function renderSaved() {
  const holder = $("presets");
  holder.replaceChildren();
  for (const [i, look] of saved.entries()) {
    const item = document.createElement("div");
    item.className = "saved-look";
    const b = document.createElement("button");
    b.textContent = look.name;
    b.style.setProperty(
      "--look",
      look.recipe.colors.primary ?? defaults.primary,
    );
    b.onclick = () => {
      void apply(look.recipe).then(gallery);
    };
    const remove = document.createElement("button");
    remove.className = "remove-look";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${look.name}`);
    remove.onclick = () => {
      saved.splice(i, 1);
      writeSaved();
      renderSaved();
    };
    item.append(b, remove);
    holder.append(item);
  }
}
function writeSaved() {
  try {
    localStorage.setItem("avatar-studio:looks", JSON.stringify(saved));
    return true;
  } catch {
    status("This browser could not save your lineup. Export a copy.", true);
    return false;
  }
}
function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}
$("try-accessories").onclick = () => {
  if (!recipe) return;
  void apply({
    ...recipe,
    parts: {
      ...recipe.parts,
      facialHair: "facial-mustache",
      eyewear: "acc-glasses",
      headwear: "hat-club-cap",
    },
  });
};
$("reference").onclick = () => {
  if (!$("reference-image").children.length) {
    for (const name of [
      "body",
      "hair",
      "clothing",
      "collection-02/ember",
      "collection-02/tide",
      "collection-02/volt",
      "hair-isolated/ember",
      "hair-isolated/tide",
      "hair-isolated/volt",
      "hair-isolated/nova",
      "hair-isolated/halo",
      "hair-isolated/reed",
      "novelty/quack",
      "novelty/starstruck",
      "novelty/galaxy",
      "wield/bubble",
      "wield/bonk",
      "wield/lantern",
      "wield/marker",
      "wield/pinwheel",
    ]) {
      const img = new Image();
      img.alt = `Zoomap ${name} component study: front, side and elevated top views.`;
      img.src = new URL(
        `references/${name}.png`,
        new URL(import.meta.env.BASE_URL, location.href),
      ).href;
      img.loading = "lazy";
      $("reference-image").append(img);
    }
  }
  $<HTMLDialogElement>("reference-dialog").showModal();
};
$("close-reference").onclick = () =>
  $<HTMLDialogElement>("reference-dialog").close();
$("export").onclick = () => {
  if (!recipe) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(recipe, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  download(url, "avatar-look.json");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("import").onclick = () => $<HTMLInputElement>("file").click();
$<HTMLInputElement>("file").onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 16000) throw Error("Appearance file is too large");
    const next = parseRecipe(await file.text(), catalog);
    await apply(next);
    gallery();
  } catch (error) {
    status((error as Error).message, true);
  }
  input.value = "";
};
$("undo").onclick = () => {
  if (draft || !history.length) return;
  future.push(recipe);
  void apply(history.pop()!, false).then(gallery);
};
$("redo").onclick = () => {
  if (draft || !future.length) return;
  history.push(recipe);
  void apply(future.pop()!, false).then(gallery);
};
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-view]"))
  b.onclick = () => stage?.view(b.dataset.view as "front" | "side" | "back");
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-pose]"))
  b.onclick = () => {
    stage?.setPose(b.dataset.pose as Motion["gesture"]);
    document
      .querySelectorAll("[data-pose]")
      .forEach((other) =>
        other.setAttribute("aria-pressed", String(other === b)),
      );
  };
for (const [id, enabled] of [
  ["soft-style", false],
  ["comic-style", true],
] as const)
  $(id).onclick = () => {
    stage?.setComic(enabled);
    $("soft-style").setAttribute("aria-pressed", String(!enabled));
    $("comic-style").setAttribute("aria-pressed", String(enabled));
  };
$("turntable").onclick = () => {
  const active = $("turntable").getAttribute("aria-pressed") !== "true";
  $("turntable").setAttribute("aria-pressed", String(active));
  stage?.turn(active);
};
$<HTMLInputElement>("reduced").checked = matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
$("reduced").onchange = () =>
  stage?.setReduced($<HTMLInputElement>("reduced").checked);
$("scale").onchange = () => stage?.scale($<HTMLInputElement>("scale").checked);
function projectionControls(state: "live" | "capturing" | "projected") {
  wieldPanel?.setFrozen(state !== "live");
  $("live-view").hidden = state === "live";
  $("live-view").textContent =
    state === "capturing" ? "Cancel capture" : "Back to live 3D";
  $("export-views").hidden = state !== "projected";
  $("projection-note").hidden = state !== "projected";
  $("capture-views").hidden = state !== "live";
}
$("capture-views").onclick = async () => {
  if (!stage) return;
  $("capture-views").setAttribute("disabled", "");
  projectionControls("capturing");
  try {
    await stage.project((done, total) =>
      status(`Drawing view ${done} of ${total}…`),
    );
    projectionControls("projected");
    status(
      "16 views captured from this pose. Orbit to compare the drawn projection.",
    );
  } catch (e) {
    projectionControls("live");
    if ((e as Error).name !== "AbortError") status((e as Error).message, true);
  } finally {
    $("capture-views").removeAttribute("disabled");
  }
};
$("live-view").onclick = () => {
  stage.leaveProjection();
  projectionControls("live");
  status("Live 3D animation.");
};
$("export-views").onclick = () => {
  try {
    download(stage.projectionPng(), "avatar-16-views.png");
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ ...stage.projectionMetadata(), recipe }, null, 2)],
        { type: "application/json" },
      ),
    );
    download(url, "avatar-16-views.json");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    status((e as Error).message, true);
  }
};
$("photo").onclick = () => {
  if (stage) download(stage.png(), "avatar-portrait.png");
};
$("save-look").onclick = () => {
  if (!recipe) return;
  if (saved.length >= 12) {
    status("Your lineup is full. Remove a look before saving another.", true);
    return;
  }
  $<HTMLInputElement>("look-name").value = "";
  $<HTMLDialogElement>("save-dialog").showModal();
};
$("save-dialog").addEventListener("close", () => {
  if ($<HTMLDialogElement>("save-dialog").returnValue !== "save") return;
  const name = $<HTMLInputElement>("look-name").value.trim();
  if (!name) return;
  saved.push({ name, recipe: structuredClone(recipe) });
  const stored = writeSaved();
  renderSaved();
  if (stored) status(`Saved “${name}” to your lineup.`);
});
async function start() {
  try {
    const response = await fetch(
      new URL("catalog.json", new URL(import.meta.env.BASE_URL, location.href)),
    );
    if (!response.ok) throw Error("The collection could not load");
    library = new AvatarLibrary(
      await response.json(),
      new URL(import.meta.env.BASE_URL, location.href).href,
    );
    catalog = library.catalog;
    const avatar = library.create();
    stage = new Stage($("stage"), avatar);
    stage.setComic(true);
    stage.onProjectionInvalidated = () => {
      projectionControls("live");
      status("Live 3D. Capture again to include your latest changes.");
    };
    thumbs = new Thumbnails(library);
    recipe = defaultRecipe(catalog);
    recipe.parts.hair = "hair-sweep";
    recipe.colors = { ...defaults };
    let storageWarning = "";
    try {
      const stored = localStorage.getItem("avatar-studio:current");
      if (stored) recipe = parseRecipe(stored, catalog);
    } catch {
      storageWarning =
        "The saved look could not be read. The current collection is ready; your saved record has not been overwritten.";
    }
    const nav = $("categories");
    for (const slot of catalog.slots) {
      const b = document.createElement("button");
      b.dataset.category = slot.id;
      b.innerHTML = `<span>${icons[slot.id] ?? "◇"}</span>`;
      b.append(document.createTextNode(slot.label));
      b.onclick = () => {
        category = slot.id;
        gallery();
      };
      nav.append(b);
    }
    await avatar.setAppearance(recipe);
    stage.inspect("avatar", catalog);
    $("loading").hidden = true;
    renderControls();
    gallery();
    readSaved();
    if (!saved.length && !hasSavedRecord) {
      saved = [
        { name: "Club captain", recipe: structuredClone(recipe) },
        {
          name: "Off duty",
          recipe: {
            ...structuredClone(recipe),
            parts: {
              ...recipe.parts,
              hair: "hair-curls",
              shirt: "shirt-hoodie",
              face: "face-grin",
              eyewear: "acc-glasses",
              facialHair: "facial-mustache",
              headwear: "hat-club-cap",
            },
            colors: {
              ...recipe.colors,
              primary: "#d29339",
              skin: "#855538",
              hair: "#171d23",
            },
          },
        },
        {
          name: "Weekend energy",
          recipe: {
            ...structuredClone(recipe),
            parts: {
              ...recipe.parts,
              hair: "hair-pony",
              shirt: "shirt-track",
              shoes: "shoes-high",
            },
            colors: {
              ...recipe.colors,
              primary: "#496d65",
              hair: "#c89144",
              skin: "#edc39d",
            },
          },
        },
      ];
    }
    for (const [name, primary, skin, hair] of [
      ["Ember", "#cf641e", "#9e6542", "#514030"],
      ["Tide", "#28847f", "#bc8565", "#182b35"],
      ["Volt", "#79283a", "#e5b48c", "#bb9964"],
    ]) {
      const button = document.createElement("button");
      button.className = "save-look";
      button.textContent = `${name} · Collection 02`;
      button.onclick = () => {
        const id = name.toLowerCase();
        const next = defaultRecipe(catalog);
        Object.assign(next.parts, {
          hair: `hair-${id}`,
          shirt: `shirt-${id}`,
          face: `face-${id}`,
        });
        Object.assign(next.colors, { primary, skin, hair });
        void apply(next);
      };
      $("collection-presets").append(button);
    }
    for (const [name, hair] of [
      ["Nova", "#aa6031"],
      ["Halo", "#5b3e2e"],
      ["Reed", "#70513d"],
    ]) {
      const button = document.createElement("button");
      button.className = "save-look";
      button.textContent = `${name} · Hair 03`;
      button.onclick = () => {
        const next = structuredClone(draft ?? recipe);
        next.parts.hair = `hair-${name.toLowerCase()}`;
        next.colors.hair = hair;
        void apply(next);
      };
      $("collection-presets").append(button);
    }
    for (const [label, parts] of [
      ["Quack Captain", { headwear: "hat-quack-captain" }],
      ["Starstruck Specs", { eyewear: "acc-starstruck" }],
      ["Pocket Galaxy", { effect: "effect-pocket-galaxy" }],
      [
        "Go silly",
        {
          headwear: "hat-quack-captain",
          eyewear: "acc-starstruck",
          effect: "effect-pocket-galaxy",
        },
      ],
    ] as const) {
      const button = document.createElement("button");
      button.className = "save-look";
      button.textContent = label;
      button.onclick = () => {
        const next = structuredClone(draft ?? recipe);
        Object.assign(next.parts, parts);
        void apply(next);
      };
      $("collection-presets").append(button);
    }
    renderSaved();
    status(
      storageWarning || "Your studio is ready. Make a little character.",
      !!storageWarning,
    );
    (window as any).avatarStudio = {
      get recipe() {
        return structuredClone(recipe);
      },
      catalog,
      library,
      stage,
      apply,
    };
    void mountWieldPanel(
      stage.avatar,
      () => {
        stage.inspect("avatar", catalog);
        document
          .querySelectorAll<HTMLElement>("[data-inspect]")
          .forEach((button) =>
            button.setAttribute(
              "aria-pressed",
              String(button.dataset.inspect === "avatar"),
            ),
          );
        wieldPanel?.setInspection(false);
      },
      wieldLifecycle.signal,
    )
      .then((panel) => {
        wieldPanel = panel;
        Object.assign((window as any).avatarStudio, {
          wield: panel.controller,
          wieldLibrary: panel.library,
        });
      })
      .catch((error) =>
        status(
          `Your avatar is ready; the toy collection could not start: ${error.message}`,
          true,
        ),
      );
  } catch (error) {
    $("loading").textContent = "Your studio could not start.";
    status((error as Error).message, true);
    const retry = document.createElement("button");
    retry.textContent = "Reload studio";
    retry.onclick = () => location.reload();
    $("loading").append(retry);
  }
}
window.addEventListener("pagehide", () => {
  wieldLifecycle.abort();
  wieldPanel?.dispose();
  thumbs?.dispose();
  stage?.dispose();
  library?.dispose();
});
void start();
