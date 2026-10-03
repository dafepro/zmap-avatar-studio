# MOONWAKE FESTIVAL

Five independently equippable collectible pieces for the isolated SHIFT capsule:

| Slot              | Component                 | Source triangles |
| ----------------- | ------------------------- | ---------------: |
| Headwear          | `hat-moonwake-crescent`   |              236 |
| Shirt             | `shirt-moonwake-festival` |              608 |
| Bottom            | `bottom-moonwake-wide`    |              478 |
| Shoes             | `shoes-moonwake-platform` |              696 |
| Accessory         | `acc-moonwake-lantern`    |              516 |
| **New set total** |                           |        **2,534** |

The visual language is folded midnight cloth, a lavender architectural collar, balloon trousers, thick platform boots and a rib-framed peach lantern. The collection uses the existing primary, secondary, trim and accent channels. It is original geometry inspired by the original [planning concept](references/moonwake/concept.jpg), not a palette-only variant of the legacy jersey and shorts. The exact original image-generation prompt is preserved in [concept provenance](references/moonwake/provenance.json).

## Equip, import, collect

Run `node scripts/build-capsule-catalog.mjs` before opening SHIFT. The existing catalog builder discovers one descriptor per piece under `public/capsule/parts/`. No original model, original catalog, original capsule `parts.json`, runtime, rig, palette channel, budget, inventory or reward system changes are required.

The standalone [set manifest](../public/capsule/sets/moonwake-festival.json) lists all five IDs and their slots, the canonical palette, and a relative link to the [complete SHIFT look](../public/capsule/looks/moonwake-festival.shift.json). In SHIFT, use **Import look** and select that JSON. The recipe uses the already shipped Spark head, Ember face and Nova ponytail, so it has no dependency on another asset PR. Each item also appears independently in its existing wardrobe category.

A host derives completion from its own inventory: the set is complete only if every component ID in `manifest.components` exists in the host's owned-ID set. A selected outfit and an owned set are different concepts; the manifest doesn't grant ownership or require the pieces to be worn together. Unknown extra owned IDs do not affect completion. There is no account, ownership persistence, economy, entitlement, reward or backend implementation in this PR.

## Editable source and fit contracts

- [Authoring script](../assets/source/moonwake_set.py) and [editable Blender scene](../assets/source/moonwake-set.blend) preserve all five parts, their meshes, materials, common armatures and weights
- The script imports only the shared rig/export helpers, then writes its five new GLBs and descriptors. It never rebuilds a legacy asset
- Tunic shoulder branches are connected. The boxy waist, flared short sleeves, folded collar, topology-supported lower panels and reverse yoke are separately sculpted
- The trousers have a welded fork and separate balloon-leg loops. Their waistband and upper-seat coordinates preserve the exact legacy interface so they fit under unrelated tops. Below the fork, vertices belong only to their own thigh/shin chain. High cuffs follow the shin rather than a shorts-only thigh weight or rigid foot weight
- Rigid boot geometry is confined to the low ankle. Flexible collar and sock geometry follow the calf; socks bridge the shipped body's feet-coverage boundary at 0.323 m. Trouser cuff bottoms are 0.313 m; rigid boot uppers stay below 0.26 m
- The open crescent band declares natural hair occlusion. It neither crops hair nor introduces per-hair variants
- The lantern is rigid decorative geometry with a padded mounting saddle and closed broad shoulder webbing. Its panels use the existing accent channel, not a new light/effect behavior
- The fixed `athlete-reference-v2` rest skeleton and 14,000-triangle / 1.5 MB / 12-part budget are unchanged. The complete set is qualified with all optional categories and the largest legacy choices at both heads and builds −1, 0 and +1

Rebuild:

```sh
blender -b --python assets/source/moonwake_set.py
node scripts/build-capsule-catalog.mjs
node --import tsx --test tests/moonwake-set.test.ts
```

## Evidence, kept distinct

1. **Planning concept:** `docs/references/moonwake/concept.jpg` is image-generated design art. It is not runtime evidence
2. **Actual GLB geometry in Blender:** `scripts/export-moonwake-evidence.ts` loads the shipping GLBs through `AvatarLibrary`, applies the body build and motion, then transfers actual fitted/posed vertices and exact embedded texture bytes to `assets/source/render_moonwake.py`. The editable [review scene](../assets/source/moonwake-review.blend) and [front](evidence/moonwake/neutral-front.png), [side](evidence/moonwake/neutral-side.png), [back](evidence/moonwake/neutral-back.png), [wave](evidence/moonwake/lean-wave-pose.png), [run](evidence/moonwake/broad-run-side.png), and broad-build images are Blender review renders. The material/shading bridge is not a claim of WebGL pixel parity
3. **Actual Chromium / shipping `ComicStyle`:** the focused `Moonwake Festival set evidence` workflow imports the complete look in SHIFT, independently selects every component and renders front, side, back, run and wave for both heads and all three builds. Its downloaded screenshots and exact workflow/head provenance will be recorded here after CI review

```sh
node --import tsx scripts/export-moonwake-evidence.ts /tmp/moonwake-runtime
blender -b --python assets/source/render_moonwake.py -- /tmp/moonwake-runtime
npx playwright test --config playwright.moonwake.config.ts
```

The focused tests check five-of-five completion, every missing-piece case, look parsing, all five individual selections against legacy pieces, all optional categories within budget, exact hashes/bytes, normalized finite weights, unchanged rest translations/scales, cuff and sole ownership, full posed edge continuity, actual shoe vertices against the floor, and four-direction lower-calf coverage through run and wave. Additional eight-view exterior visibility probes cover deep knee flex and the visible knee/calf anatomy. Their [recorded diagnostics](evidence/moonwake/trouser-clearance.json) separate actual cuff-aperture sight lines from fabric piercing and do not count hidden masked anatomy as exposed skin. Raw internal triangle intersections remain diagnostics because self-overlapping balloon folds are not a watertight solid. This is visual/geometry qualification, not a device-performance or arbitrary-terrain claim.

The fitted review scene was also opened in a separate interactive Blender window and inspected from its back camera, side orthographic and front orthographic views. Both native `.blend` files use Blender's lossless compression and retain editable meshes, source weights and packed review textures. Local format, type, unit and build checks are recorded separately from the Chromium CI evidence.

The lower lavender shapes are cut into the actual tunic support triangles. This removes the original non-planar overlay/backing that intersected the cloth in poses. Both mirrored shapes therefore keep a clean supported boundary through movement; no decorative slab is moved outward to hide a fitting defect.

The manual `scripts/qualify-collectible-mixes.ts` integration check can be run with four independent checkouts or a combined checkout. It is intentionally not a normal CI prerequisite and does not create a dependency on another unmerged set. Run `node --import tsx scripts/qualify-collectible-mixes.ts --help` for its explicit worktree and output arguments.

The repository concept is a same-resolution JPEG90/4:4:4 derivative for compact review. It has no visual content edits; the exact prompt, original full-resolution PNG hash, and derivative hash are retained in the concept provenance. The original PNG remains in the local authoring archive.

The [four-set mixing qualification](collectible-mix-qualification.md) records 336 assembled cases and 1,680 sampled poses against all twenty hash-pinned assets, including this final Moonwake geometry. These local integration measurements remain separate from the requested Chromium visual evidence.
