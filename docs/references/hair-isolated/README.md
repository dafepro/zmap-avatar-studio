# Isolated hair references

These three image-generated sheets clarify the hair silhouettes from the [Collection 02 concepts](../collection-02/). They are authoring references, not renders of the implemented models. The supplied [original hair study](../hair.png) remains the user's original art reference. Exact generation prompts, input images, and output names are recorded in [provenance.json](provenance.json).

| Style | Shape to preserve | Common mismatch to reject |
| --- | --- | --- |
| [Ember](ember.png) | Low, dense crown of irregular interlocking coiled locks; compact sides and a clean nape | Isolated beads, tall spikes, or a disconnected cap |
| [Tide](tide.png) | Offset part, broad diagonal fringe, curved bob panels, pointed jaw-length ends | Symmetrical helmet, short fringe, or detached side flaps |
| [Volt](volt.png) | Broad swept locks forming one coherent quiff above dark cropped sides | Thin fins, regularly spaced leaves, or a raised fan with gaps |

Each sheet contains front, strict left-facing side, back, and top views. Treat the generated views as visual guidance, and resolve any inconsistency by preserving a coherent three-dimensional hairstyle. A good front view alone does not establish a match.

## Blender comparison loop

1. Execute the component builder in its dedicated Blender scene. `assets/source/hair_review.py`, loaded after the collection review script, packs these sheets as viewport-only image guides. The guides retain a provenance pointer in their custom properties.
2. Inspect the actual hair with a neutral grey head and no face, clothing, or body detail. Preserve the shared scalp foundation while changing the visible masses, part, fringe, silhouette, and directional surface accents.
3. Run `render_hair_views()` to capture all twelve geometry views. For a focused iteration, use `render_hair_views(styles=['tide'], views=['front', 'side'])`. Each camera has the same .80-unit square orthographic frame; the side camera shows a left-facing profile and the top camera places the forehead below. The helper restores camera, resolution, output settings, and preview visibility after capture, including after a render error.
4. Compare the new images in `docs/evidence/hair-isolated/blender-{style}-{view}.png` against the matching concept view. Check the broad silhouette and part first, then lock flow, root continuity, crown volume, nape coverage, and the balance of ink and cel shading. Do not use generated images as evidence of implemented geometry.
5. Recheck exported GLBs in the browser across supported heads, weight extremes, hats, and glasses. These Blender views assess authored appearance; the runtime combination checks assess fitting and compatibility.

The four views intentionally use fixed framing rather than independent auto-fit. This makes an oversized crown, flattened back, overly wide sides, or insufficient nape length visible between iterations. Blender evidence is written separately from concept art so an improved drawing cannot be mistaken for an improved game asset.
