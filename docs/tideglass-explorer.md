# Tideglass Explorer

An original five-piece collectible set for the isolated SHIFT capsule. The set combines a swept fin crown, sculpted short-sleeve shell top, articulated technical trousers, broad reef boots and a compact twin-fin pack. All five pieces are independently selected through existing categories. No runtime, ownership, economy, inventory or reward behavior changes.

## Collectible contract

`public/capsule/sets/tideglass-explorer.json` contains exactly five slot/ID/label records, the canonical teal/deep-teal/ice/coral palette and a relative complete-look recipe. A host can derive completion by checking that its approved owned-ID collection contains every component ID. Partial sets stay wearable; completion grants nothing by itself. Identity and ownership remain the host's responsibility.

Import `public/capsule/looks/tideglass-explorer.shift.json` into SHIFT. It uses the original Scout head, Tide face and Tide hair, and an empty original hand-equipment loadout. No sibling asset PR is required.

The source rig remains `athlete-reference-v2`; the 14,000-triangle, 1.5 MB and 12-part limits and all existing palette channels are unchanged. The legacy catalog, legacy GLBs and `public/capsule/parts.json` are untouched. The generated capsule catalog is deliberately not committed.

## Geometry and fitting

- Fin crown: open forehead bridge and swept temple fins. Hair may naturally obscure the band. No hair cropping, per-hair variants or containment envelope
- Shell top: complete connected short-sleeve cloth coverage, sculpted chest shell, integrated shoulder/waist facets and split standing collar. Mounted shell skinning is barycentrically transferred from the actual underlying cloth, including its solved shoulder field
- Technical trousers: welded pelvis, fitted long legs, dense anatomical knee rings and separate conforming knee/shin protection. Full leg/shin skin weights replace shorts-only weighting
- Reef boots: broad low rigid foot shells, segmented toe guards and thin flexible socks through 0.356 m. Rigid geometry stays below 0.26 m; the trouser cuff remains above 0.28 m. The sock bridges the legacy feet mask at 0.323 m
- Twin-fin pack: compact faceted pod, short fins, closed 14 mm-thick webbing and broad cushioned mounting pads. Padding intentionally meets/compresses against shirt surfaces; its purpose is attachment rather than empty stand-off space

Shell return walls terminate at the cloth, including a 1 mm hidden backing overlap. Tests require the exposed decorative faces to stay outside cloth rather than forcing the entire backing away and creating floating plates. The trouser clearance report retains all-anatomy intersection counts: masked thigh tissue and concave internal folds are not claimed to be collision-free cloth simulation. Eight-azimuth exterior visibility probes separately check for visible skin leakage and distinguish rays entering actual open cuffs.

## Authoring and provenance

The original image-generated planning sheet and exact prompt are under `docs/references/tideglass/`. It is concept art, not implementation evidence. The concept's incidental gloves were omitted because handwear is outside these five slots. No weapons, copied costume assets, textures or per-weight asset variants were introduced.

`assets/source/tideglass_explorer.py` creates the original geometry in Blender using the established rig/export helpers. `assets/source/tideglass-explorer.blend` is the editable weighted source. Rebuild with:

```sh
blender -b --python assets/source/tideglass_explorer.py
node scripts/build-capsule-catalog.mjs
```

Actual loaded/fitted/posed GLB geometry is transferred through `scripts/export-tideglass-evidence.ts` into Blender review scenes. This uses AvatarLibrary's body fields, skin binding, body-region masking and motion before transfer. The renderer does not substitute concept pixels or claim browser shader parity.

```sh
node --import tsx scripts/export-tideglass-evidence.ts
blender -b --python assets/source/render_tideglass.py -- /tmp/tideglass-runtime
```

The neutral, lean-wave and broad-run review `.blend` scenes preserve those runtime-posed meshes. A separate Blender GUI instance was opened for actual source inspection; the pre-existing unsaved session and its file browser were left untouched.

## Verification and evidence

`tests/tideglass-set.test.ts` checks:

- The exact five-piece manifest, palette, independently missing-item completion and full SHIFT import
- Individual legacy swaps and 54 complete optional stacks: nine original hairstyles, both heads and weights −1/0/+1, all within unchanged budgets
- Finite normalized skinning, anatomy-following socks and shin-owned lower trousers
- Lower-leg anatomical coverage, actual head/crown surface clearance and exposed hard-panel/cloth intersections
- Run/wave geometry, unchanged rest translations/scales and actual shoe-vertex floor support over 1,080 frames
- Fifteen deep-flex trouser states with eight-view visible-skin probes, preserving hidden internal crossing diagnostics honestly

Blender review images and runtime recipe/diagnostic records are under `docs/evidence/tideglass/`. `tests/fixtures/tideglass-review.ts` renders the shipping ComicStyle with the actual GLBs in Chromium. Its focused CI saves complete-set and full-optional-stack front/side/back/run/wave sheets across both heads and all three weights, plus a real SHIFT import screenshot. The browser test also imports individual legacy substitutions and verifies unrelated selections stay unchanged.

Local Chromium launch is unavailable in the cloud VM. Browser and packed-consumer qualification run in approved GitHub Actions; see `docs/evidence/tideglass/ci-provenance.json` when the downloaded evidence has been reviewed. Draft status does not imply merge or deployment approval. Phone/full-room performance and arbitrary terrain support remain consumer qualification work.
