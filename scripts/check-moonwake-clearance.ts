import { readFile, writeFile } from "node:fs/promises";
import { AvatarLibrary } from "../src/runtime";
import {
  captureRestAnatomy,
  measureTrouserClearance,
} from "../tests/helpers/moonwake-trouser-clearance";
import "../tests/helpers/node-image";
const c = JSON.parse(await readFile("public/capsule/catalog.json", "utf8")),
  look = JSON.parse(
    await readFile("public/capsule/looks/moonwake-festival.shift.json", "utf8"),
  );
const lib = new AvatarLibrary(
  c,
  "https://moon.test/",
  async (input) =>
    new Response(
      await readFile("public/capsule" + new URL(String(input)).pathname),
    ),
);
const results = [];
for (const weight of [-1, 0, 1]) {
  const a = lib.create();
  const recipe = structuredClone(look.appearance);
  recipe.body = { weight };
  await a.setAppearance(recipe);
  const rest = captureRestAnatomy(a.object);
  for (const frame of [0, 11, 22, 33, 44, 55, 66]) {
    for (let i = 0; i <= frame; i++) a.update(i / 60, { gesture: "run" });
    const r = measureTrouserClearance(a.object, "bottom-moonwake-wide", rest);
    results.push({ weight, frame, ...r });
    console.log(
      weight,
      frame,
      r.bodyCrossings,
      r.visibleSamples,
      r.naturalCuffSamples,
      r.exposedSamples.length,
    );
  }
  a.dispose();
}
lib.dispose();
await writeFile(
  "docs/evidence/moonwake/trouser-clearance.json",
  JSON.stringify(results, null, 2) + "\n",
);
if (results.some((r) => r.exposedSamples.length)) process.exitCode = 1;
