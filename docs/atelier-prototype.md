# SHIFT · Character Lab prototype

This is a local, editable prototype on top of `dafepro/zmap-avatar-studio` main `4798863633d67bf92531c39fa22559fceab6fb6d`. It adds a separate `/atelier.html` route and a separate capsule catalog. The existing runtime exports, rig, source catalog and consumer are unchanged.

## What is real

- Three.js/WebGL avatar assembled from actual GLB components, with the original verified-asset loading, shared skeleton, surface fitting, body-volume field and cel ink
- Original Circuit jacket, Relay vest and Pulse pack meshes, authored in Blender. Garments are skinned to the same named bones as the base body; the pack is independently equipped
- Six curated hairstyles, two head shapes, six expressions, six skin swatches, continuous lean-to-full build, six tops, two bottoms, three shoes, independent eyewear/headwear/accessory slots
- Both hands independently equip the five existing playful tools. Equipment survives wardrobe swaps and is included in saved looks
- Three starter combinations, four coordinated palettes, custom primary color, undo, reset, local named presets, bounded JSON import/export, portrait export, camera viewpoints, orbit, turntable, walk/run/wave and pause
- Catalog thumbnails are rendered from the actual chosen components by a separate avatar instance. They are not pre-rendered concept illustrations
- Responsive phone layout, keyboard buttons, visible focus, reduced-motion-aware starting state and native save dialog
- Fonts are local, licensed under the included SIL Open Font License. The prototype needs no external service or account

## Run

Use Node 22+.

```sh
npm ci
node scripts/build-capsule-catalog.mjs
npm run dev:atelier
# http://localhost:5180/atelier.html
```

The ordinary `npm run dev` and original `/index.html`, `/wield.html`, `/action.html` are preserved. `dev:atelier` listens only on loopback by default.

```sh
npm run typecheck
npm test
npm run build
npm run test:atelier
```

`dist/atelier.html` is the new production route. Serve the entire `dist` directory over HTTPS or localhost, because the runtime verifies GLB SHA-256 through Web Crypto. Do not open it with `file://`. An ordinary static HTTP server is sufficient; there is no backend. No deployment was performed.

The dedicated Playwright config uses Playwright’s installed Chromium. Run `npx playwright install chromium` first, or set `CHROMIUM_PATH` to another installed Chromium. `ATELIER_TEST_URL=https://your-private-preview.example` skips its local server and tests that preview. Do not point tests at a production app or another user's data. Browser tests use synthetic local names only.

## Modular contract

Coordinates remain metres, Y up, +Z forward, floor at Y=0. The rig remains `athlete-reference-v2`, with 16 named sockets. New garment GLBs are root-mounted skins that name those same bones. Rigid head parts mount at `head`; clothing has explicit body-region coverage; footwear keeps foot contact. This remains the original contract rather than a parallel assembly implementation.

The original catalog is unchanged. `public/capsule/catalog.json` has its own identity, `shift-capsule@1.0.0`, and an isolated `models/` root. The build helper copies original model bytes, checks new asset bytes/hashes, and assembles the new catalog. `public/capsule/parts.json` is the additive list of three new descriptors. No recipe is silently remapped between catalogs.

A saved look is a UI-owned envelope:

```ts
type Look = {
  format: "shift-look";
  version: 1;
  name: string; // 1–48 characters
  appearance: Recipe; // the unchanged package contract
  equipment: WieldLoadout; // the unchanged equipment contract
};
```

It contains no identity, inventory, account rights, asset URL, script, transport or database state. Import applies package validation to both halves; unknown fields, missing parts, invalid palettes, rig/catalog mismatches and exhausted budgets fail visibly. The original package source remains unchanged. The UI serializes appearance/equipment operations, coalesces rapid requests, restores the previous complete look on failed loads, and keeps saving disabled until a change settles.

Named looks are stored only in this browser under a distinct local key, with up to 12 names. Saving an existing name replaces that look. A portable exported JSON is the backup and contains both outfit and held gear. No cloud sync is implied. The browser debug handle `window.__atelier` is intentionally available for prototype QA.

## Verification and limits

- TypeScript: passed
- Production build: passed (existing shared Three.js chunk size warning remains)
- Complete repository Node test suite: 164 passed, 0 failed, including ten preset/descriptor tests
- New asset verification: see `public/capsule/validation.json` and `docs/capsule-assets.md` for final exact part hashes, geometry counts, body-build and animated fitting evidence
- Nine browser regression tests are provided in `tests/browser/atelier.spec.ts`
- Real Chromium browser verification passed all nine tests on GitHub Actions at source commit `f6521f1a1402788063ce2a727744e56f8f2aa9a0`. The [successful run](https://github.com/dafepro/zmap-avatar-studio/actions/runs/37086264742) produced actual desktop, dual-gear, pack-back and mobile screenshots. See `docs/evidence/atelier/`. The local VM browser restriction remains, so browser testing uses the repository's CI runner. A later thumbnail-framing polish is rechecked by the same CI suite; its status is visible on the draft PR
- Production-asset consumer integration, phone performance, exhaustive interpenetration testing and subjective art review remain future qualification work

The existing 14,000 source-triangle / 1.5 MB / 12 appearance-part budgets remain enforced. New garment tests sample three builds and documented poses; sampled clearance is not a proof for every animation frame. This is an editable design/interaction prototype, not a new released package.

## Consumer integration

See [the exact consumer contract notes](atelier-consumer-contract.md). In particular, `fc-workout-pwa` still pins v0.1.2, uses three server-assigned appearances, and cannot persist this look envelope in its flat profile-avatar endpoint. It does not copy a capsule directory automatically. Do not drop these recipes into that consumer without an explicit integration change and its own tests.

## Files to start with

- `app/atelier.ts`, `app/atelier.css`: studio controls and visual design
- `app/atelier-stage.ts`: actual 3D stage and thumbnails
- `app/atelier-state.ts`: recipe envelope, presets, bounded persistence
- `assets/source/studio_capsule.py`: editable new asset authoring
- `public/capsule/studio-capsule.blend`: editable Blender scene
- `public/capsule/parts.json`, `catalog.json`, `models/`: new descriptors and runtime assets
- `scripts/build-capsule-catalog.mjs`: reproducible isolated catalog assembly
- `tests/atelier-state.test.ts`, `tests/browser/atelier.spec.ts`: regression coverage
