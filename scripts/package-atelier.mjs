/** Prepare a bounded static preview without historic boards or authoring files. */
import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
const out = "outputs/preview";
await mkdir(out, { recursive: true });
for (const f of await readdir("dist"))
  if (f.endsWith(".html")) await cp(path.join("dist", f), path.join(out, f));
for (const f of [
  "assets",
  "models",
  "wield",
  "action",
  "fonts",
  "catalog.json",
  "study-reference.png",
])
  await cp(path.join("dist", f), path.join(out, f), { recursive: true });
await mkdir(path.join(out, "capsule"), { recursive: true });
await cp("dist/capsule/catalog.json", path.join(out, "capsule/catalog.json"));
await cp("dist/capsule/models", path.join(out, "capsule/models"), {
  recursive: true,
});
console.log(path.resolve(out));
