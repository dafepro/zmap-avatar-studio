import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { performanceData } from "../src/performance-data.js";

const sourceDirectory = new URL(
  "../assets/source/performances/",
  import.meta.url,
);

test("performance sources preserve exact creator files and independently verified samples", () => {
  const provenance = JSON.parse(
    fs.readFileSync(new URL("provenance.json", sourceDirectory), "utf8"),
  );
  for (const file of [...provenance.rawFiles, ...provenance.licenseFiles]) {
    const bytes = fs.readFileSync(new URL(file.file, sourceDirectory));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    assert.equal(file.modified, false);
  }
  const verification = JSON.parse(
    fs.readFileSync(new URL("verification.json", sourceDirectory), "utf8"),
  );
  const bytes = fs.readFileSync(
    new URL("source-samples.json", sourceDirectory),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    verification.samplesSha256,
  );
  assert.equal(Object.keys(verification.clips).length, 11);
  for (const clip of Object.values(verification.clips) as any[]) {
    assert.ok(clip.maxPositionErrorMetres < 1e-5);
    assert.ok(clip.maxRotationErrorRadians < 1e-5);
  }
});

test("retargeted performance clips have finite normalized poses and monotone authored timing", () => {
  assert.equal(performanceData.bones.length, 15);
  assert.equal(Object.keys(performanceData.clips).length, 9);
  for (const clip of Object.values(performanceData.clips)) {
    assert.equal(clip.frames[0].time, 0);
    assert.ok(Math.abs(clip.frames.at(-1)!.time - clip.duration) < 1e-7);
    clip.frames.forEach((frame, index) => {
      assert.equal(frame.root.length, 3);
      assert.equal(frame.rotations.length, performanceData.bones.length * 4);
      assert.ok(
        [...frame.root, ...frame.rotations, frame.support, frame.time].every(
          Number.isFinite,
        ),
      );
      if (index > 0) assert.ok(frame.time > clip.frames[index - 1].time);
      for (let joint = 0; joint < performanceData.bones.length; joint++) {
        const q = frame.rotations.slice(joint * 4, joint * 4 + 4);
        assert.ok(Math.abs(Math.hypot(...q) - 1) < 2e-7);
      }
    });
    for (const marker of clip.markers)
      assert.ok(marker.time > 0 && marker.time < clip.duration);
  }
});

test("stow reverses the entire authored pickup with complementary release timing", () => {
  for (const suffix of ["One", "Two"] as const) {
    const draw = performanceData.clips[`equip${suffix}`];
    const stow = performanceData.clips[`stow${suffix}`];
    assert.equal(draw.source.clip, "PickUp");
    assert.equal(stow.source.reverse, true);
    assert.equal(draw.duration, stow.duration);
    assert.equal(draw.markers[0].name, "grip");
    assert.equal(stow.markers[0].name, "release");
    assert.ok(
      Math.abs(draw.markers[0].time + stow.markers[0].time - draw.duration) <
        1e-7,
    );
    draw.frames.forEach((frame, index) => {
      const reversed = stow.frames[stow.frames.length - 1 - index];
      assert.deepEqual(reversed.root, frame.root);
      assert.deepEqual(reversed.rotations, frame.rotations);
      assert.equal(reversed.support, frame.support);
      assert.ok(Math.abs(reversed.time + frame.time - draw.duration) < 1e-7);
    });
  }
  assert.match(
    performanceData.clips.equipTwo.source.adaptation,
    /not a native two-hand draw/,
  );
});
