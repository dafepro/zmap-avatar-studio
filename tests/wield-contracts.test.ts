import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateWieldCatalog,
  validateWieldLoadout,
  emptyWieldLoadout,
  type WieldCatalog,
  WIELD_LIMITS,
} from "../src/wield-core";

export function wieldCatalog(): WieldCatalog {
  const asset = (id: string) => ({
    id,
    label: id,
    node: id,
    url: `models/${id}.glb`,
    bytes: 2000,
    sha256: "a".repeat(64),
    triangles: 10,
  });
  const pose = {
    arm: [-0.1, 0, 0],
    forearm: [-1.15, 0, 0],
    wrist: [0, 0, 0],
  } as const;
  return {
    version: 1,
    id: "wield-test",
    revision: "1.0.0",
    rig: "fixture",
    grips: {
      left: {
        ...asset("grip-left"),
        hand: "left",
        frame: {
          position: [-0.024, -0.073, 0.046],
          rotation: [Math.PI / 2, 0, Math.PI / 2],
        },
      },
      right: {
        ...asset("grip-right"),
        hand: "right",
        frame: {
          position: [0.024, -0.073, 0.046],
          rotation: [Math.PI / 2, 0, -Math.PI / 2],
        },
      },
    },
    items: [
      {
        ...asset("wand"),
        behavior: "wand",
        gripAnchor: "wand_grip",
        anchors: { tip: "wand_tip" },
        pose: {
          left: structuredClone(pose),
          right: structuredClone(pose),
        } as any,
      },
    ],
  };
}
test("wield catalogs are strict data-only records with fixed independent budgets", () => {
  const valid = wieldCatalog();
  validateWieldCatalog(valid);
  const cases: ((c: any) => void)[] = [
    (c) => (c.script = "run"),
    (c) => (c.items[0].url = "https://bad.test/item.glb"),
    (c) => (c.items[0].behavior = "__proto__"),
    (c) => (c.items[0].sha256 = "wrong"),
    (c) => (c.items[0].triangles = WIELD_LIMITS.item + 1),
    (c) => (c.grips.left.triangles = WIELD_LIMITS.grip + 1),
    (c) => (c.grips.left.hand = "right"),
    (c) => (c.grips.left.frame.position[0] = NaN),
    (c) => (c.items[0].pose.left.wrist[1] = 4),
    (c) => (c.items[0].anchors.tip = c.items[0].gripAnchor),
    (c) => (c.items[0].anchors.grip = "other"),
    (c) => c.items.push(structuredClone(c.items[0])),
  ];
  for (const mutate of cases) {
    const c = structuredClone(valid);
    mutate(c);
    assert.throws(() => validateWieldCatalog(c));
  }
});
test("two hand loadouts do not become appearance part combinations or escape budgets", () => {
  const c = wieldCatalog(),
    loadout = { ...emptyWieldLoadout(c), left: "wand", right: "wand" };
  validateWieldLoadout(loadout, c);
  for (const invalid of [
    { ...loadout, right: "missing" },
    { ...loadout, third: "wand" },
    { ...loadout, rig: "different" },
    { ...loadout, revision: "0.9.0" },
    { ...loadout, left: undefined },
  ])
    assert.throws(() => validateWieldLoadout(invalid, c));
  c.items[0].bytes = 100000;
  validateWieldCatalog(c);
  assert.throws(() => validateWieldLoadout(loadout, c), /budget/);
  assert.equal(WIELD_LIMITS.held, 2200);
  assert.equal(WIELD_LIMITS.visible, 16000);
});
