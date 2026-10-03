import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadCapsuleParts } from "./capsule-descriptors.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  out = path.join(root, "public/capsule");
const base = JSON.parse(
  await readFile(path.join(root, "public/catalog.json"), "utf8"),
);
const parts = await loadCapsuleParts(
  out,
  base.assets.map((asset) => asset.id),
);
await mkdir(path.join(out, "models"), { recursive: true });
for (const name of await readdir(path.join(root, "public/models")))
  if (name.endsWith(".glb"))
    await copyFile(
      path.join(root, "public/models", name),
      path.join(out, "models", name),
    );
for (const asset of parts) {
  const bytes = await readFile(path.join(out, asset.url));
  if (
    bytes.length !== asset.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    throw new Error(`Capsule descriptor is stale: ${asset.id}`);
}
const catalog = {
  ...base,
  id: "shift-capsule",
  revision: "1.0.0",
  assets: [...base.assets, ...parts],
};
delete catalog.compatibleRecipeRevisions;
await writeFile(
  path.join(out, "catalog.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log(
  `Wrote isolated ${catalog.id}@${catalog.revision} with ${catalog.assets.length} parts; original catalog unchanged.`,
);
