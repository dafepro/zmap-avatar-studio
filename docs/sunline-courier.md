# SUNLINE COURIER · five-piece collectible set

An original angular courier capsule adapted to `athlete-reference-v2`: coral and cream planes, charcoal structure, and small citron fasteners. The long shaped sleeves, stepped crop, full tapered trousers, split-front trainers and folded envelope pack are new geometry, not palette variants of the existing tee/shorts.

## Independent pieces

- `hat-sunline-visor`: open-crown band and split swept brim; natural hair occlusion
- `shirt-sunline-courier`: asymmetrical cropped shell, folded storm lapels, long articulated sleeves and complete fabric underlayer
- `bottom-sunline-cargo`: welded crotch, tapered trouser legs, broad closed folded pockets and cuffed ankles
- `shoes-sunline-track`: bevelled/notched runner sole, sculpted low upper, connected heel pull and flexible ankle fabric
- `acc-sunline-envelope`: bevelled delivery-envelope housing, folded V flap, padded back contacts and two closed broad straps

Each descriptor lives in `public/capsule/parts/`; each model lives in `public/capsule/models/`. The existing additive capsule builder discovers these records. The original catalog, original models, original `parts.json`, rig, material channels and budget contracts are unchanged. The generated capsule catalog is deliberately not committed.

The standalone collection manifest is [`sunline-courier.json`](../public/capsule/sets/sunline-courier.json). A host can derive collection completion by checking that all five `components[].id` values are in its own owned-item set. It can derive an equipped collection by comparing each component's `slot` and `id` with the current recipe. This is descriptive metadata only: no inventory, economy, reward, backend or runtime ownership contract is added.

The linked [`sunline-courier.shift.json`](../public/capsule/looks/sunline-courier.shift.json) is a complete SHIFT import, with original Scout head, Grin expression and Sweep hair. It has no dependency on any other unmerged asset PR. Import it through SHIFT's existing Import look button; the same five pieces remain individually selectable.

## Source and rebuild

- Original planning art: [`concept.png`](references/sunline/concept.png), with exact prompt in adjacent provenance JSON. This is concept art, not implemented geometry or a screenshot
- Deterministic mesh/skin source: [`sunline_courier.py`](../assets/source/sunline_courier.py)
- Editable authored mesh and reference weights: [`sunline-courier.blend`](../assets/source/sunline-courier.blend)
- Loaded/fitted/posed runtime transfer: [`export-sunline-evidence.ts`](../scripts/export-sunline-evidence.ts)
- Blender review renderer: [`render_sunline.py`](../assets/source/render_sunline.py)
- Inspectable runtime-derived neutral/wave/run scene: [`sunline-review.blend`](../assets/source/sunline-review.blend)

```sh
blender -b --python assets/source/sunline_courier.py
node scripts/build-capsule-catalog.mjs
node --import tsx scripts/write-sunline-look.ts
node --import tsx scripts/export-sunline-evidence.ts /tmp/sunline-runtime
blender -b --python assets/source/render_sunline.py -- /tmp/sunline-runtime
node --import tsx --test tests/sunline-courier.test.ts
```

The source imports only established rig/export helpers before the reference builder's first asset call, and writes only Sunline assets. Authored coordinates use metres, Y up and +Z forward; the source rig and rest translations are unchanged. Clothing and pack use explicit torso ownership where a wide low shell could otherwise be mistaken for an arm. Pants use the full leg/shin weight field. The rigid shoe collar is below 0.26 m; pant cuffs start at 0.286 m. Thin flexible sock geometry reaches 0.356 m to cover the existing foot mask when mixed with cropped trousers.

## Qualification and evidence

The five new parts total 2,658 source triangles and 270,424 bytes. The largest tested complete 12-part look, including both head choices, all legacy hairstyles, three builds, glasses, mustache and orbit effect, uses 13,153 fitted triangles. The unchanged limits remain 14,000 triangles, 1.5 MB and 12 parts.

Focused tests cover descriptor hashes, manifest/recipe integrity, individual selection and replacement, full optional-slot budgets, finite normalized weights, complete leg/shin ownership, rigid sole vs flexible sock ownership, cuff/collar mixing envelope, and 61 samples each of run and wave at all three builds. They also check connected-edge stretch, unchanged socket translations/scales, two-way head/visor intersections and complete hairstyle preservation. A dedicated 30-case three-build diagnostic samples idle, wave and eight run phases, separating hidden-anatomy triangle crossings from true exterior skin samples and natural cuff-aperture views. It caught a real knee poke at 0.5 seconds, corrected with a shaped knee ring and clearance. The final measurements have no sampled exterior leaks. Internal overlap with hidden anatomy remains recorded; these results are not a universal zero-intersection claim.

The `docs/evidence/sunline-courier/` PNGs without `browser-` prefixes are Blender review renders of the geometry after actual `AvatarLibrary` loading, body fitting and runtime posing. They are not browser screenshots and do not claim pixel parity with ComicStyle. The review includes front, side, back, widest build, wave and run. It caught and corrected visible calf penetration, buried shin trim, an unconnected heel pull, shallow pocket gussets and a floating-pack appearance. The actual runtime-fitted neutral, broad wave and broad run meshes were also opened together and inspected interactively in cloud Blender. An earlier disposable review instance closed during material preview; a fresh supported launch successfully displayed the final three-pose scene.

The focused GitHub Actions workflow runs the shipping `ComicStyle` WebGL renderer, imports the full look through the actual studio, selects every piece independently, and captures a 24-panel full-body sheet: front, side, back, wave, run and deep-knee run across lean Scout, regular Scout, broad Spark, and a full 12-slot look. The reviewed final-geometry browser evidence is [`browser-collection.png`](evidence/sunline-courier/browser-collection.png) and [`browser-studio.png`](evidence/sunline-courier/browser-studio.png). These are actual shipping WebGL captures from [focused CI run37093172516](https://github.com/dafepro/zmap-avatar-studio/actions/runs/37093172516), asset head `de836969829c7e4b3e66406b143a0a8d294d5967`. Exact artifact IDs, image hashes and model hashes are in [`provenance.json`](evidence/sunline-courier/provenance.json). Direct Chromium launch is not used in this VM.

## Limits

These are fixed-height stylized garments with shared skinning, not cloth simulation. Natural hair/visor overlap is intentional; the visor does not crop or swap any hair mesh. Qualifying the set does not certify arbitrary future garments, all possible extreme joint rotations, terrain-aware foot support, or phone/GPU performance. Use the same assembly and rendered checks when introducing a new silhouette. No merge or deployment is part of this draft.
