# Collection 02: neck size and three modular looks

Catalog revision 2.1.0 adds nine independent components to the existing 24. The original components remain available. Ember, Tide and Volt are one-click starting looks in the studio, including for people with an existing saved lineup. Selecting a starter uses its coordinated face, hair and jersey; each slot can then be swapped independently. Shorts and sneakers reuse the study components.

| Look  | Hair                                         | Gear                                                                            | Face                           |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Ember | Coiled crop with a filled, tapered scalp     | Orange warm-up jersey, standing charcoal collar, quarter zip, cream side panels | Raised brows and a toothy grin |
| Tide  | Side-part bob with broad pointed side masses | Teal crew-neck court jersey, cream shoulder yoke and cuffs                      | Calm smile and freckles        |
| Volt  | Swept quiff with contrasting short undercut  | Burgundy raglan jersey, charcoal sleeves, cream V binding and diagonal tape     | Asymmetric raised-brow smirk   |

## Reference generation

Three separate built-in imagegen calls produced the [Ember](references/collection-02/ember.png), [Tide](references/collection-02/tide.png) and [Volt](references/collection-02/volt.png) concepts. The supplied body study and the previous weight/style study were references. The exact prompts are saved as `ember-prompt.txt`, `tide-prompt.txt` and `volt-prompt.txt` beside the images. Generation used the built-in tool with its default model/settings; these were not CLI calls or external asset downloads.

Each sheet includes a front view, strict side profile, overhead crown, elevated full figure and expression detail. The concepts are design targets, not evidence of exported geometry. The Studio's **Study sheet** dialog includes the new sheets alongside the original references.

## Interactive Blender workflow

The active source remains [reference_kit.py](../assets/source/reference_kit.py). It executes [collection_02.py](../assets/source/collection_02.py) before the generic accessories and [collection_review.py](../assets/source/collection_review.py) after assembling the preview scene. Run it through interactive Blender MCP using the namespace recipe in [reference workflow](reference-workflow.md). This replaces only objects tagged `zmap_reference` in the dedicated scene, not other work in the open file.

The saved [reference-kit.blend](../assets/source/reference-kit.blend) includes all three packed concept images as named viewport image empties and nine named orthographic cameras: each look's **front**, **side**, and **top**. Image empties are excluded from renders. Every reference sheet remains available without external image paths. Select its named image empty to inspect it in the viewport; cameras render the actual component meshes.

After rebuilding, capture all nine views through the interactive connection:

```python
ns = bpy.app.driver_namespace['zmap_reference']
ns['render_collection_views']()
```

This temporarily hides neighboring previews so they cannot occlude a profile, renders each camera, and restores visibility/camera settings even if a render fails. It writes actual Blender images to `docs/evidence/collection-02/blender-{look}-{view}.png`. The saved file contains only the dedicated scene and its dependencies; the original live file is not replaced.

## Iteration and corrections

1. Authored independent hair volumes, connected shirt surfaces and three front/profile ink expressions from the new sheets. Expressions share a transparent atlas generated from original SVG artwork; existing expressions retain their own atlas.
2. Found and fixed a Blender preview transform error: joining primitives can retain a mesh-local offset. Preview copies now preserve that basis when placing an asset at its socket. Exported geometry and preview geometry must agree.
3. Rejected the initial scalp dome after overhead renders exposed skin between hair masses. A dome sampled at different heights around its circumference cut through the head between rings. Rebuilt it using common skull-height rings and explicit clearance. A new ray test checks the crown against both actual head meshes, including between authored vertices.
4. Reworked Volt's flat fin-like wedges into closed swept sections with varied breadth, depth and height. They are connected visually to a filled crown. The final quiff still needs more graceful lock curvature and more deliberate ink detail to match the drawing.
5. Removed Tide's inherited front V dip to produce a crew-neck shoulder yoke. Simplified redundant rear hair masses after a fully equipped bob exceeded the source triangle limit. Kept the 14,000-triangle appearance budget unchanged.
6. Added a neck field anchored to the head socket. Neck and collar thickness change with body weight; facial landmarks, scalp, joint centers and total height remain fixed. The field blends out toward the chin and shoulder junction. No new weight-specific clothing is required.
7. Compared actual GLBs in the shipping browser renderer from front, side and overhead, with cap/glasses/mustache, and across lean/study/heavier builds. These images are generated by the browser test fixture, not imagegen.

## Validation

- 45 avatar unit tests, including 217,728 structural combinations; all authored head/hair/hat/glasses states with heaviest remaining equipment; actual accessory intersections, restoration and instance isolation; crown coverage on both heads; neck girth and actual standing-collar clearance at weight -1, 0 and 1.
- 23 avatar browser tests, including the three starter controls and 24 new comparison panels across orthographic, accessory and weight views.
- Parent ZMap consumer: 27 unit tests and 7 browser integration tests, including real multiplayer clients, shaped traffic, host loss and lifecycle resource bounds.
- Independent packed consumer: ESM/declarations, all GLB contracts, production build, actual WebGL skinning/textures and sixteen-direction capture.
- The worst fitted source geometry remains 13,862 triangles. Silhouette outlines are an additional render pass and are reported separately. The expanded complete catalog is limited to 2.1 MB of GLBs; the per-appearance 1.5 MB limit remains unchanged. Concept sheets are documentation/reference downloads, not runtime model textures.

Actual browser comparisons: [front / side / top / accessories](evidence/collection-02/runtime-orthographic.png), [neck and collar size comparison](evidence/collection-02/runtime-necks.png). Adjacent JSON records source and rendered triangle counts. These checks establish function and bounded geometry, not final art approval or mobile-room performance. Hair curve quality, subtle fabric folds and hand-placed linework still need further art refinement against the concepts.
