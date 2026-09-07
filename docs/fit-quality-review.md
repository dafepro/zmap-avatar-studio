# Model compatibility review · 2.2.0

The [reported rear clipping](evidence/fit-quality/reported-rear-clipping.png) exposed two structural problems: scalp foundations used rough dome approximations instead of the asymmetric head contour, and eyewear clearance rules treated normal hair overlap as a collision requiring hair removal. A crown-only regression missed the rear and temple band.

## Corrections

| Problem                                                    | Change                                                                                                                                                                                          | Regression evidence                                                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Rear skull and temples pierced hair                        | One shared scalp foundation follows the head's actual contour rows, including every rear silhouette breakpoint. Styling transforms operate on locks only.                                       | Actual ray/triangle visibility across rear, temples and crown in 144 assembled head/hair/weight/accessory states.                       |
| Glasses cut large windows in hair                          | Explicit `occlude` response leaves all hair attributes, topology and geometry untouched. The depth buffer hides stems inside hair.                                                              | Glasses alone and with hats preserve the exact corresponding hair geometry, including shared-mesh ownership and cache restoration.      |
| Shorter temples pushed the complete frame forward          | `wrap` fitting separates exported `front` rims/bridge from `side` stems. Front depth comes from actual overlapping triangles; stems fit laterally around the head/ears.                         | Both minimum and maximum front gaps; bidirectional head/ear intersection checks; a sparse synthetic frame against an unseen round head. |
| Long triangles could bridge a curved skin surface          | Front clearance includes overlap edges/intersections. Side contact uses bounded refinement of triangle interiors.                                                                               | Synthetic sparse geometry reproduces failures that vertex-only tests miss.                                                              |
| Cap squeezed the wider head's temple clearance too tightly | Widened the cap shell and its interior field together by 2.2% in X.                                                                                                                             | Head coverage plus actual hair/cap intersection checks, including unseen oversized hair.                                                |
| Undercut changed with clothing accents                     | Dark roots are vertex pigment multiplied by the hair color, independent of `secondary`. Exported active color layers survive joins and both render styles.                                      | Hair geometry/material/pigment equality when shirt/accessory colors change; changing hair color still recolors the whole hairstyle.     |
| Hairstyles did not represent their concepts                | Isolated four-view concepts drive a new dense coiled crop, a closed asymmetric bob and a filled swept quiff. The ponytail has a gathered root; original swept cuts have directional rear locks. | Multiple interactive Blender iterations, fixed orthographic hair-only comparisons and shipping browser orbits.                          |

## Boundaries and extension rules

These changes retain one source asset per hairstyle and one per accessory. There are no head/hair/accessory pair variants. The authoring foundation is shared within the currently qualified reference head family. Adding a different skull requires passing that family's coverage gate; the system does not claim arbitrary imported heads automatically fit.

Physical overlap is selective. Hair can hide glasses, bands or headphones; hats contain hair inside an authored crown. Skin must remain outside solid eyewear. A future accessory must state the intended response instead of copying an existing blanket clearance volume. Contradictory occlusion and deformation rules for the same accessory/target are rejected.

Wrapped assets declare `fit.projection: "wrap"`, `fit.sideOffset`, and semantic `fitRole: "front" | "side"` on their mesh nodes. The Blender exporter joins only pieces with the same role. Missing roles, unsafe offsets, excessive fitting distances, unresolved contact or exceeded geometry limits reject the candidate appearance explicitly. Existing appearance state and other instances remain intact.

## Reproduction

Rebuild the dedicated scene through interactive Blender MCP with `reference_kit.py`; call its namespace's `render_collection_views()` for front/side/top/back/rear-oblique captures and `render_hair_views()` for twelve isolated front/side/back/top views. The saved `assets/source/reference-kit.blend` includes packed concept sheets and named review cameras. The source scripts and catalog are versioned together.

From `avatar-studio`, run `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run build` and `npm run test:package`. From the parent repository, run the existing unit/browser checks to exercise the consuming application. No relaxed appearance budget or fallback model is introduced.

[Scalp orbit](evidence/fit-quality/scalps-orbit.png) and [glasses orbit](evidence/fit-quality/glasses-orbit.png) show all six hair styles from eight angles on the wider head. These are actual browser renders, not generated concept art. Adjacent JSON includes source and rendered geometry counts. The collection's updated Blender and runtime sheets remain in `evidence/collection-02`.

The largest tested fully equipped appearance uses 13,814 source triangles, below the unchanged 14,000 limit. The complete 33-model catalog uses 1,918,808 bytes against its 2.1 MB gate. Outline rendering is an additional pass. Structural recipe checks cover 217,728 combinations; they do not mean every possible look has received individual art approval.

Final validation: 54 avatar unit tests and 24 real-browser tests pass, including 144 assembled scalp-coverage states and 96 orbit panels. The separate packed consumer checks actual WebGL rendering, skinning, texture decoding and sixteen-direction capture. The ZMap consumer retains its separate multiplayer and lifecycle integration suite.

## Hair art iteration

[Isolated concepts and provenance](references/hair-isolated/README.md) are authoring references. [The final twelve-view Blender comparison](evidence/hair-isolated/review.png) is implemented geometry. Earlier `iteration-01`, `iteration-02` and `iteration-03` sheets retain rejected intermediate shapes; their defects must not be mistaken for current exports.

- Ember: 33 bent, interlocking coils follow the actual crown and hairline. Front and rear transition rows eliminate exposed smooth bands between coils. Three surface-projected C-fold accents use the hair palette. The crop stays low rather than forming an icosphere pyramid.
- Tide: one closed mantle establishes crown, side and nape volume. The asymmetric fringe samples that mantle's actual triangles, including its underside overlap, so it cannot float like the first independent panels. A longitudinal off-centre part samples the assembled surface, and continuous pigment removes radial shading spokes.
- Volt: broad closed curved locks have unequal pointed tips, a filled swept crown and a continuing rear flow. The interior volume eliminates air slots between opposing front and back locks. Root pigment is independent of clothing colors.
- Original cuts: crown-to-nape locks follow the supplied swept study's direction. The ponytail joins through a gathered root and a solid curved taper instead of an isolated flat card.

Coverage and style are separate authoring responsibilities: the shared head-derived foundation is preserved while each style changes its visible masses. This avoids relearning skull clearance for every haircut. None of these edits introduce head-specific or accessory-specific style variants.

The silhouettes and volume are materially closer, but the renders remain more geometric and cleaner than the drawings. Ember's curl edges, Tide's overlapping fringe shading, and the quiff's fine directional ink need further art refinement for a close painterly match. This iteration is a measured improvement with compatibility evidence, not a claim that concept fidelity is finished.
