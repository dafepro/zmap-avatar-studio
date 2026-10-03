import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** Load original capsule plus separately reviewable per-piece records. */
export async function loadCapsuleParts(directory, baseIds = []) {
  const initial = JSON.parse(
    await readFile(path.join(directory, "parts.json"), "utf8"),
  );
  if (!Array.isArray(initial))
    throw new Error("Capsule parts must be an array");
  const parts = [...initial];
  let filenames = [];
  try {
    filenames = await readdir(path.join(directory, "parts"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const filename of filenames
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const part = JSON.parse(
      await readFile(path.join(directory, "parts", filename), "utf8"),
    );
    if (!part || Array.isArray(part) || typeof part !== "object")
      throw new Error(`Expected one capsule part: ${filename}`);
    if (`${part.id}.json` !== filename)
      throw new Error(`Capsule part filename must match id: ${filename}`);
    parts.push(part);
  }
  const ids = new Set(baseIds);
  return parts.map((part) => {
    if (!part || typeof part.id !== "string" || !part.id)
      throw new Error("Capsule part must have an id");
    if (ids.has(part.id)) throw new Error(`Duplicate capsule part: ${part.id}`);
    ids.add(part.id);
    return {
      ...part,
      tags: [...new Set([...(part.tags ?? []), "shift-capsule"])],
    };
  });
}
