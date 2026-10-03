# Crane undercut braid

Crane is one original, independently selectable hairstyle for the SHIFT capsule: a compact diagonal chisel sweep, close cropped sides, and a short three-link chevron braid at the nape. It complements the taller Volt silhouette. It does not replace an existing hair or change the legacy catalog.

## Concept and implemented result

[Original four-view concept](references/crane/concept.png) · [Exact prompt/provenance](references/crane/provenance.json)

The concept was generated with the built-in image generator on October 3, 2026. It is aspirational artwork, not model evidence. The implementation retains the concept's asymmetry, close undercut and segmented rear tail, with fewer broad locks and cleaner game-scale pigment. It intentionally does not reproduce every sketched strand.

Actual exported geometry, loaded and fitted by `AvatarLibrary`, transferred with its world-space posed vertices and exact embedded PNGs, then rendered in Blender:

- [Front](evidence/crane/neutral-front.png), [side](evidence/crane/neutral-side.png), [rear](evidence/crane/neutral-back.png), [overhead](evidence/crane/neutral-top.png)
- [Lean build, wave](evidence/crane/lean-wave-pose.png) and [broad build, cheer](evidence/crane/broad-cheer-pose.png)
- [Fitted cap and glasses, front](evidence/crane/fitted-front.png) and [rear](evidence/crane/fitted-back.png)
- [Exact recipes, poses and geometry counts](evidence/crane/runtime-assemblies.json)

The Blender review renderer has its own cel shading and outline implementation. These images prove actual exported/fitted/posed geometry; they are not presented as browser screenshots or pixel-identical shipping shading. The saved review scene was also opened and rendered in an independent interactive Blender 4.3.2 session on the cloud computer. Textures are packed so the review scene is self-contained.

## Source and integration

- `assets/source/hair_crane.py`: deterministic original geometry source
- `assets/source/hair-crane.blend`: editable named scalp, locks, braid links and tail, saved before mesh consolidation
- `assets/source/crane-review.blend`: packed actual-runtime assembly with review camera/materials
- `public/capsule/models/hair-crane.glb`: single shipped source model
- `public/capsule/parts/hair-crane.json`: independent descriptor, loaded by the capsule builder

Only the new descriptor and GLB join the capsule. `public/catalog.json`, existing model binaries and original capsule `parts.json` remain unchanged. The derived capsule catalog is rebuilt by the existing hooks.

The source uses the existing `scalp_foundation` without changing protected temple/posterior zones. The author-defined front opening stays within its supported hairline contract. All pigment belongs to the `hair` palette channel. There are no head-specific or hat-specific copies, geometry cutouts for glasses, runtime hairstyle special cases, or additional fitting envelopes. The braid follows the head socket as a rigid game-style sculpture, not simulated strands.

## Verification

- Model: **1,684 triangles; 43,588 bytes**
- **54 actual assembled coverage states**: two heads × three body weights × three hat states × three eyewear states
- Radial rear/temple and overhead crown rays use actual head/hair triangles, including triangle interiors
- Cap/hair triangle crossings are checked in both directions for both head shapes and both hats
- Glasses preserve every hair attribute/index, including the cap-fitted state; removing accessories restores the cached original geometry exactly
- Posed Blender evidence: 11,178 source triangles without accessories, 12,512 with cap/glasses, within the 14,000 limit
- Local unit suite: **167 tests passed**; typecheck, format check and production build passed

Browser verification passed in [CI run 37087055637](https://github.com/dafepro/zmap-avatar-studio/actions/runs/37087055637) for asset commit `0a58ac40d6a1b3de57fd0492cb4f58cf23a68abe`. The studio UI selected Crane without changing the other recipe fields; the shipping `ComicStyle` renderer captured eight angles with no accessories, glasses, and cap + glasses, with no page or shader errors. The downloaded artifact SHA-256 was verified and all views were inspected. The SHIFT studio regression job also passed. Full legacy-suite status is tracked on the PR checks.

[Actual studio screenshot](evidence/crane/browser-studio.png) · [Eight-angle hair](evidence/crane/browser-orbit.png) · [Glasses](evidence/crane/browser-glasses.png) · [Cap + glasses](evidence/crane/browser-cap-glasses.png) · [CI/artifact provenance](evidence/crane/verification.json)

The low silhouette, short braid and independent palette read clearly in the shipping renderer. The hair is deliberately simpler than the concept drawing. Source triangle counts are 11,178 bare, 11,706 with glasses and 12,512 with cap/glasses; silhouette ink adds its own rendering pass.

## Rebuild

```sh
blender -b --python assets/source/hair_crane.py
node scripts/build-capsule-catalog.mjs
node --import tsx --test tests/crane-hair.test.ts
node --import tsx scripts/export-crane-evidence.ts /tmp/crane-runtime
blender -b --python assets/source/render_crane.py -- /tmp/crane-runtime
npm test
npm run typecheck
npm run build
npx playwright test --config playwright.crane.config.ts
```

`hair_crane.py` upserts only its own descriptor; rerunning it preserves other capsule pieces. The source authoring/export and actual-runtime evidence scripts are separate on purpose.
