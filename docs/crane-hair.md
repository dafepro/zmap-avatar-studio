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

Browser verification is delegated to the repository's CI Chromium job because direct browser execution on the cloud VM is restricted. `Crane hair asset evidence` selects the real part through the studio UI, checks that other recipe fields are preserved, then captures the shipping `ComicStyle` renderer at eight angles with no accessories, glasses, and cap + glasses. Its artifact is `crane-hair-actual-browser-evidence`. Browser results are not claimed until that exact-head job completes and its images are inspected.

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
