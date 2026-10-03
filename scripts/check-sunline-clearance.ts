import { readFile, writeFile } from "node:fs/promises";
import { AvatarLibrary, type Catalog, type Recipe } from "../src";
import {
  captureRestAnatomy,
  measureTrouserClearance,
} from "../tests/helpers/sunline-trouser-clearance";
import "../tests/helpers/node-image";
const root = new URL("../public/", import.meta.url);
const catalog: Catalog = JSON.parse(
  await readFile(new URL("capsule/catalog.json", root), "utf8"),
);
const recipe: Recipe = JSON.parse(
  await readFile(
    new URL("capsule/looks/sunline-courier.shift.json", root),
    "utf8",
  ),
).appearance;
const library = new AvatarLibrary(
  catalog,
  "https://sunline.test/",
  async (input) =>
    new Response(
      await readFile(
        new URL("capsule" + new URL(String(input)).pathname, root),
      ),
    ),
);
const results = [];
for (const weight of [-1, 0, 1])
  for (const [motion, elapsed] of [
    ["idle", 0],
    ["wave", 1],
    ["run", 0.125],
    ["run", 0.25],
    ["run", 0.375],
    ["run", 0.5],
    ["run", 0.625],
    ["run", 0.75],
    ["run", 0.875],
    ["run", 1],
  ] as const) {
    const avatar = library.create();
    try {
      const r = structuredClone(recipe);
      r.body = { weight };
      await avatar.setAppearance(r);
      const rest = captureRestAnatomy(avatar.object);
      for (let frame = 0; frame <= elapsed * 60; frame++)
        avatar.update(
          frame / 60,
          motion === "wave"
            ? { emote: { id: "wave", elapsed: frame / 60 } }
            : motion === "run"
              ? { velocity: { x: 0, z: 3.8 }, grounded: true }
              : {},
        );
      const report = measureTrouserClearance(
        avatar.object,
        "bottom-sunline-cargo",
        rest,
      );
      results.push({ weight, motion, elapsed, ...report });
      console.log(
        weight,
        motion,
        elapsed,
        "crossings",
        report.bodyCrossings,
        "visibleLeaks",
        report.exposedSamples.length,
        "cuffViews",
        report.naturalCuffSamples,
      );
    } finally {
      avatar.dispose();
    }
  }
library.dispose();
await writeFile(
  new URL(
    "../docs/evidence/sunline-courier/trouser-clearance.json",
    import.meta.url,
  ),
  JSON.stringify(results, null, 2) + "\n",
);
if (results.some((r) => r.exposedSamples.length)) process.exitCode = 1;
