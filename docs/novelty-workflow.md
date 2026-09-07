# Novelty accessories · Quack, Starstruck and Pocket Galaxy

Catalog `2.4.0` adds three original accessories to the existing `athlete-reference-v2` rig. Each accessory has one source asset. Fitting uses the existing headwear, eyewear and effect contracts; it does not select a different mesh for each hairstyle.

The finished assets are available through individual quick choices or **Go silly**, which equips all three while preserving the rest of the current look. Review the [actual Blender four-view sheet](evidence/novelty/review.png), [assembled browser looks](evidence/novelty/browser-lineup.png) and [nine-hair orbit sheet](evidence/novelty/browser-orbits.png). The [first](evidence/novelty/iteration-01.png) and [second](evidence/novelty/iteration-02.png) iterations retain intermediate defects separately.

## Concepts and editable sources

| Accessory                                             | Part ID / slot                    | Editable source                                         | Shape to preserve                                                                                   |
| ----------------------------------------------------- | --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Quack Captain](references/novelty/quack.png)         | `hat-quack-captain` / `headwear`  | [novelty_quack.py](../assets/source/novelty_quack.py)   | Yellow rubber duck, flattened orange bill, splayed wings and raised tail inside a chunky teal float |
| [Starstruck Specs](references/novelty/starstruck.png) | `acc-starstruck` / `eyewear`      | [novelty_specs.py](../assets/source/novelty_specs.py)   | Open star and crescent rims, golden bridge and curved arms with teal tips                           |
| [Pocket Galaxy](references/novelty/galaxy.png)        | `effect-pocket-galaxy` / `effect` | [novelty_galaxy.py](../assets/source/novelty_galaxy.py) | Mint UFO, tilted-ring Saturn and coral comic star orbiting the lower legs                           |

The built-in image generator created all three four-view sheets on September 7, 2026, using the supplied [hair study](references/hair.png) as the style reference. [provenance.json](references/novelty/provenance.json) retains each exact prompt, input, original generated path and saved filename. The prompts request internally consistent front, left-facing side, back and top views with neutral mannequins. These generated images establish design targets; they are not renders, reconstructed geometry or evidence that an accessory fits.

## Interactive authoring loop

1. Execute [reference_kit.py](../assets/source/reference_kit.py) through interactive Blender MCP using the [reference workflow](reference-workflow.md#interactive-blender-loop). It builds the dedicated `Zoomap · reference components` scene while preserving unrelated Blender work. [novelty_collection.py](../assets/source/novelty_collection.py) invokes each builder directly in the reference socket coordinates, after legacy accessory scaling, and owns catalog declarations and GLB export.
2. Inspect the packed concepts alongside the editable meshes. [novelty_review.py](../assets/source/novelty_review.py) adds viewport-only image guides with provenance properties and neutral gray preview anatomy. The concept guides are hidden from renders.
3. Call `render_novelty_views()` from the builder namespace, or use `render_novelty_views(styles=['quack'])` for a focused pass. It writes `docs/evidence/novelty/blender-{style}-{view}.png`. Cameras are orthographic: front looks from +Z, side from +X, back from −Z, and top from +Y. Four views of one unchanged object are captured at 768 × 768. Orthographic scales are 1.18 for Quack, 0.68 for Starstruck and 2.12 for Galaxy; keep framing fixed within each comparison. The helper restores render settings, camera and visibility afterward.
4. Compare broad silhouettes first, then attachment, visible openings, depth, color and ink. Save iteration sheets separately before overwriting the individual latest-view PNGs. Change source geometry, rebuild, and inspect the new actual render; improving a drawing does not improve the asset.
5. Re-export the GLBs and inspect them through the shipping browser runtime. Blender previews establish authored appearance; runtime fitting, animation and combination checks establish integration behavior. Save the dedicated scene and dependencies to `assets/source/reference-kit.blend` after the accepted pass.

## Fitting and color contracts

Quack mounts on `head` and declares one hair `contain` volume: center `[0, 0.1125, -0.0096]`, radii `[0.2097144, 0.1908, 0.2024]`, transition `[-0.054, 0.0675]`. Its wearing aperture stays open underneath. The ring bulge and crown roof form one continuous exterior, with no hidden bottom disk or torus inner wall passing through contained hair. Qualify triangle interiors against the volume, not just mesh vertices.

The cuff failure explains why its entry must start above `max(transitionEnd, fieldCenterY)`. Radial containment can lift hair that began below the transition endpoint toward the field center. An entry at Y = 0.125 provides a declared safe boundary above 0.1125; repeatedly moving the cuff just beyond a sampled collision is insufficient. The raised inflatable rim remains outside this entry, and even the duck's hidden base sits above the containment ellipsoid's highest point.

Starstruck mounts on `head`, fits `face-v2` using clearance plus wrapping, and separates front rims/bridge from side arms with `fitRole`. Its declared front offset is 0.016 m and side offset is 0.003 m. Hair interaction is `occlude`: the stems may disappear naturally inside hair, without carving a channel through it. The eye openings are real holes in the rim meshes.

Galaxy mounts on `root` and uses the existing `orbit` effect. It introduces no simulation object or physical gameplay advantage. Its source arrangement was widened to approximately 0.82 m radius after a running-stride measurement reached 0.616 m. The radial clearance check accounts for each miniature's full footprint and the moving legs, rather than comparing only object centers. Reduced motion freezes the orbit at its initial orientation.

All three use original fixed material colors without new palette channels. Changing a shirt, skin or hair color must not recolor the duck or miniature planets. Initialize white vertex pigment on pieces without authored pigment before joining meshes that have a color attribute; otherwise those pieces can acquire zero/black colors.

The qualification family includes all nine catalog hairstyles: Study sweep, Reverse sweep, Swept pony, Coiled crop, Side-part bob, Swept quiff, Nova ponytail, Halo afro and Reed waves. Both approved heads, supported weights and additional wide/tall synthetic probes exercise the same accessory sources. This is reusable fitting within a validated contract, not a guarantee for arbitrary imported hair, skull geometry or animated fitting volumes.

## What the iterations revealed

Iteration 01 showed Quack's partly buried eyes, black crest and oversized conical hat support. The first intersection sweep also found hair crossing the hidden bottom cap and torus inner wall. The revised shell removes those internal surfaces entirely. Eyes now project onto the actual head triangles; broader crest geometry and initialized pigment restore its yellow color and the eye glints.

Iteration 02 confirmed clearer eyes and crest, but the float still read as a broad conical brim with a duck perched above it. The next source pass raises the ring bulge around the belly and adds a shallow inner lip over a small support roof. A separate diagnosis located the remaining intersections at the low cuff entry, leading to the boundary rule above. The final export passes the original intersection thresholds with both corrections together.

Starstruck's four-view review preserves open rims and the side-arm depth. Galaxy's static view alone did not establish safe motion: its orbit size was revised from measured running geometry. Neither a convincing front render nor a clean idle pose replaces a fitted or animated check.

## Exact packing and saved looks

[glb_compact.py](../assets/source/glb_compact.py) saved 78,900 bytes in the measured catalog export by packing eligible `WEIGHTS_0` arrays as normalized UINT8. It accepts only values that decode to exactly the original numeric weights; in this kit, that benefits rigid 0/1 weights. Positions, normals, colors, images and nonrepresentable weights retain their payloads. Shared, interleaved, overlapping or bounded accessors are left untouched. Four pure-Python tests cover exact round trips, metadata/payload preservation, nonexact values and unsafe layouts; all four pass.

Catalog `2.4.0` explicitly declares `2.2.0` and `2.3.0` as accepted saved-recipe revisions. Existing IDs, slots and color channels remain available. Acceptance still checks the current catalog, rig, parts, colors and budgets; it neither substitutes parts nor rewrites saved selections. New default looks use the current revision.

## Qualification

Run from `avatar-studio`:

```sh
python3 -B -m unittest discover -s assets/source -p test_glb_compact.py
npm test
npm run test:e2e
npm run typecheck
npm run build
npm run test:package
```

The checks must cover hair coverage and actual accessory intersections, reversible unequip and instance isolation, fixed pigments, complete radial orbit clearance and reduced motion. Browser tests exercise saved looks, reload, individual novelty choices, the combined “Go silly” action, and a delayed head load. Review all nine hairstyles at eight angles, three complete looks, and desktop/portrait framing in both rendering styles. Their evidence fixture renders actual shipping GLBs and writes recipes and bounds alongside the images; concept PNGs never enter that rendering path.

Retain the 2.1 MB complete catalog gate and each appearance's 14,000 source triangles, 1.5 MB and 12-part limits. Source estimates do not replace exported/fitted measurements, and successful local checks do not establish full-room phone performance.

| Asset            | Source triangles | GLB bytes |
| ---------------- | ---------------: | --------: |
| Quack Captain    |              584 |    20,416 |
| Starstruck Specs |              480 |    24,912 |
| Pocket Galaxy    |              364 |    25,216 |

The 39-model catalog totals **2,076,852 bytes**. All **60 avatar unit tests** pass, including 933,120 structural recipes, 486 scalp-coverage states and 180 complete head/hair/hat/glasses budget states. The maximum measured fitted assembly remains **13,900 source triangles**. Existing and synthetic wide/tall hairstyles have zero measured hat intersections under the original checks. The orbit test samples all three shoes, three weights, four motions and five times, and also verifies reduced-motion freezing and fixed accessory colors.

All **30 avatar browser tests** pass. The new evidence includes 72 head-orbit panels and three full looks at lean, neutral and heavy builds. The UI tests cover saved 2.3.0 looks, individual/combined quick choices, recoloring, exact hair restoration after removing the hat, save/reload, and a pending head edit. [Desktop](evidence/novelty/studio-full-desktop.png) and [portrait](evidence/novelty/studio-full-portrait.png) frames verify the complete equipped avatar in both render styles; studio framing now derives from the actual visible geometry for every inspection mode.

Type checking, formatting, production build and the independently installed avatar package check pass. The latter loads every packaged GLB contract, decodes painted textures, renders skinned geometry and captures sixteen directions in Chrome. Four Python packing tests pass. The saved Blender file contains 39 source assets, 19 packed images, 24 isolated hair cameras and 12 new novelty cameras, alongside the existing collection studies.

A [decoded legacy-asset comparison](evidence/novelty/legacy-geometry.json) against `7e7f16e` verifies exact positions, normals, indices, UVs, pigments, skinning, transforms, materials and nine embedded images for all 36 existing models. Only storage representation and export bookkeeping changed. The 78,900-byte saving does not trade away geometric or skinning precision.

The game models retain the concepts' main shapes and colors, with cleaner pigment and fewer surface details than the drawings. The duck float has a deliberately open wearing aperture for compatible hair entry, and Galaxy uses a wider orbit than the concept to clear running legs. Generated multi-view discrepancies are resolved into one coherent 3D object. Animated cloth, flexible glasses stems and arbitrary external-model compatibility are not established by these checks.
