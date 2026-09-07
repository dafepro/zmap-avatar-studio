# Hair 03 · Nova, Halo and Reed

The third hair study adds three standalone assets to the existing avatar runtime. Existing heads, expressions, clothing, hats and eyewear remain reusable. Each style has one source asset; there are no per-head or per-accessory variants.

## Reference and source

| Style         | Reference                                              | Editable source              | Defining shape                                                                     |
| ------------- | ------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------- |
| Nova ponytail | [Four-view concept](references/hair-isolated/nova.png) | `assets/source/hair_nova.py` | Split face-framing bangs, gathered high root, broad arching tail and hooked ends   |
| Halo afro     | [Four-view concept](references/hair-isolated/halo.png) | `assets/source/hair_halo.py` | Full rounded scalloped silhouette, open face, compact nape and sparse curl accents |
| Reed waves    | [Four-view concept](references/hair-isolated/reed.png) | `assets/source/hair_reed.py` | Low double arch, centre part, flowing S-curtains and layered nape                  |

The built-in image generation tool created these authoring references using the supplied original hair sheet as the style and head-proportion reference. Exact prompts are recorded in [Collection 03 provenance](references/hair-isolated/collection-03-provenance.json). Generated drawings are not evidence of implemented models.

`collection_03.py` creates each qualified scalp foundation, invokes the corresponding style builder and exports its GLB. `reference_kit.py` builds the whole catalog inside its dedicated interactive Blender scene. Other open Blender work is preserved. The saved `assets/source/reference-kit.blend` includes packed reference images and named cameras.

## Iteration method

1. Compare the isolated front, strict side, back and top concepts. Identify the silhouette, root position, part, major waves and nape boundary before adding surface detail.
2. Preserve the shared head-derived scalp foundation. An optional frontal hairline profile controls the forehead opening while the protected temple/posterior boundary stays fixed. Use the visible style's own smooth support surface to seat bangs and directional features; independent free-floating panels are insufficient.
3. Run `render_hair_views(styles=['nova','halo','reed'])` through interactive Blender MCP. The common 1.05-unit orthographic frame includes the complete ponytail; the overhead target is shifted 0.10 units toward the rear. All styles share that framing, so relative size remains visible.
4. Compare actual geometry in `docs/evidence/hair-isolated/blender-{style}-{view}.png`. Earlier `collection-03-iteration-*` sheets retain intermediate failures separately from the final `collection-03-review.png`.
5. Inspect exported models in the shipping illustrated browser renderer. The catalog-driven orbit test covers every hairstyle, while `hair-03.spec.ts` adds cap-and-glasses combinations and checks that the new quick choices retain all other selected parts, body weight and skin color.
6. Re-run coverage, accessory intersection, complete equipment budgets, package integrity and the independent packed consumer before publishing the catalog and Blender source together.

## What the renders changed

Nova's first tail was narrow and stood directly behind the centre of the head. The next pass widened it, shifted the flow laterally and added stations around the arch. Continuous forehead fitting replaced discontinuous nearest-point branches. Tail panel marks live directly in the mesh's pigment topology, so they follow its curve without floating ribbons.

Halo's first regular-grid surface averaged its lobes into a helmet. Increasing that field's amplitude still produced broad rock-like lumps. A clipped geodesic surface and the rounded maximum of localized support lobes create the scalloped outline while retaining one closed mantle. Curl marks are projected onto its actual triangles.

Reed's first radial fitting erased the intended S-curves; preserving separate projection planes then produced pinched overlaps and pointed peaks. The revised construction uses a continuous support envelope and fewer dominant wave panels. Silhouette and support are designed together rather than correcting arbitrary guide geometry after the fact.

## Compatibility and budgets

Catalog revision 2.3.0 explicitly accepts recipes from 2.2.0 through `compatibleRecipeRevisions`. This declaration does not choose replacement pieces, skip validation or silently accept every older version. Catalog identity, rig, part IDs, channels, body fields and resource limits still apply. Recipes retain their original revision and selections. Incompatible or malformed recipes remain rejected. Against the preceding `df79b35` commit, all 33 existing GLBs retain identical binary geometry/image payloads and identical JSON structure after excluding Blender datablock names; part IDs and rig contracts are preserved.

The complete model catalog retains its 2.1 MB gate. Individual appearances retain 14,000 source triangles, 1.5 MB and 12 selected parts. Silhouette outlines add a separate rendering pass. The collection's broader catalog does not establish full-room phone performance or arbitrary imported-head compatibility.

## Final review and validation

[Actual four-view Blender comparison](evidence/hair-isolated/collection-03-review.png) · [Shipping browser hairstyle views](evidence/hair-isolated/collection-03-browser.png) · [Cap/glasses orbits](evidence/hair-isolated/collection-03-accessories.png)

| Asset         | Source triangles | GLB bytes |
| ------------- | ---------------: | --------: |
| Nova ponytail |            1,785 |    60,948 |
| Halo afro     |            1,768 |    59,440 |
| Reed waves    |            1,800 |    46,004 |

The final 36-model catalog totals 2,085,208 bytes. All 58 avatar unit tests pass, including 311,040 structural recipe combinations and 216 assembled scalp-coverage states. The largest measured fitted assembly is 13,900 source triangles. The browser evidence contains 144 catalog-wide hair/glasses orbit panels and 24 additional new-hair cap/glasses panels. A passing orbit capture checks rendering and budgets; visual review remains a separate step.

The fourth modeling pass corrected Halo's size and exposed forehead band, and Reed's flat crown and outward-pointing fringe. Authored forehead profiles keep the shared foundation behind each visible hairline while preserving the side and rear coverage boundaries. Final Blender views show coherent roots, napes and parts from four directions. The models remain simpler than their concept drawings: Halo has fewer visible curl divisions, Reed has fewer side layers, and the pigment is cleaner than the concepts' painted texture. These are usable stylized game assets with documented art limits, not exact reproductions of every drawn strand.

The 27 browser tests include saved-recipe compatibility, reload, preserving equipment when switching hair, a delayed-head-load regression that verifies a quick hair choice retains the pending head selection, and in-product inspection framing across views and viewport sizes. Type checking, production build, and the independent packed-consumer browser check also pass.

Hair inspection now frames the actual visible geometry with an aspect-aware bounding sphere, recalculating after a part swap or viewport change. Front, Side and Back retain that inspection target. The regression checks projected vertices in both render modes and captures [desktop](evidence/hair-isolated/studio-hair-nova-desktop.png) and [portrait](evidence/hair-isolated/studio-hair-nova-portrait.png) inspection evidence. This adaptive studio framing is separate from the fixed 1.05-unit Blender authoring cameras.
