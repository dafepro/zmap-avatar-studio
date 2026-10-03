import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCapsuleParts } from "../scripts/capsule-descriptors.mjs";

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "capsule-parts-"));
  try {
    await writeFile(
      path.join(directory, "parts.json"),
      JSON.stringify([{ id: "shirt-original", tags: ["athlete"] }]),
    );
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("capsule descriptors retain original parts and append sorted independent records", async () => {
  await fixture(async (directory) => {
    assert.deepEqual(
      (await loadCapsuleParts(directory)).map((a) => a.id),
      ["shirt-original"],
    );
    await mkdir(path.join(directory, "parts"));
    for (const id of ["shoes-second", "hair-first"])
      await writeFile(
        path.join(directory, "parts", `${id}.json`),
        JSON.stringify({ id, tags: ["athlete", "shift-capsule"] }),
      );
    const parts = await loadCapsuleParts(directory, ["body-athletic"]);
    assert.deepEqual(
      parts.map((a) => a.id),
      ["shirt-original", "hair-first", "shoes-second"],
    );
    assert.ok(
      parts.every(
        (part) =>
          part.tags.filter((tag) => tag === "shift-capsule").length === 1,
      ),
    );
  });
});

test("capsule descriptors reject duplicate IDs and mismatched filenames", async () => {
  await fixture(async (directory) => {
    await assert.rejects(
      loadCapsuleParts(directory, ["shirt-original"]),
      /Duplicate/,
    );
    await mkdir(path.join(directory, "parts"));
    const filename = path.join(directory, "parts", "shirt-original.json");
    await writeFile(filename, JSON.stringify({ id: "shirt-original" }));
    await assert.rejects(loadCapsuleParts(directory), /Duplicate/);
    await writeFile(filename, JSON.stringify({ id: "shirt-mismatch" }));
    await assert.rejects(loadCapsuleParts(directory), /filename must match/);
  });
});
