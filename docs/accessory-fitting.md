# Accessory fitting

Facial hair, eyewear and headwear are independent optional slots. The host application supplies one recipe; the avatar runtime performs fitting before committing the appearance.

## One source mesh per hairstyle

Accessories declare how they interact with hair. Physical containment and natural overlap are separate policies. A hat describes its interior once, and that field packs the crown of any selected hair mesh into the available space. The field blends out below the brim, leaving lower hair free. The same original ponytail folds under the crown and remains visible behind the head. The cap has an actual rear opening. There are no hairstyle IDs, compatibility tags, replacement meshes or per-hat hair variants in this process.

Round glasses use `hairFit: [{ targetSlot: "hair", mode: "occlude" }]`. The depth buffer hides their temples inside opaque hair, and a fringe may overlap the rims. Neither overlap is a defect. This policy preserves the complete hair silhouette, attributes and topology, including when a hat has already fitted the hair. It performs no splitting, cutting, deformation or geometry allocation. The frame's separation from **skin** is a different contract, `fit.mode: "clearance"`, and remains enforced. Hair must not be cut away to make every piece of eyewear visible.

An `occlude` entry contains only `targetSlot` and `mode`. Validation rejects geometric parameters, unknown fields and any second policy for the same target on that accessory. This prevents a future temple-clearance box from silently overriding the intended occlusion. A geometric `contain` or `clearance` interaction is an explicit authoring decision; it is never inferred from mesh overlap. Headbands and headphones currently use natural depth occlusion too, without requesting hair deformation.

For accessories that explicitly require geometric clearance, containment runs first and clearances run in a stable order independent of recipe keys. Triangles crossing a deformation boundary are split and their attributes interpolated. Bounded clearance iterations and a final cut prevent long edges from bridging a requested exclusion region. Such destructive clearance is unsuitable for ordinary eyeglass temples. Contradictory constraints and exceeded budgets fail explicitly. Fitting runs once at assembly; animation and camera movement add no per-frame collision work. The final geometry must still fit the catalog triangle budget.

All edits apply to instance-owned geometry. Removing the accessory rebuilds from the same cached original hair mesh. Other avatars and prepared factories retain their original geometry. Wearing a hat does not fetch another hair file or change the selected hairstyle ID.

A new accessory first chooses the physical relationship appropriate to each target: natural occlusion, crown containment or deliberate geometric clearance. Only the latter two need a fitting envelope. A new hairstyle needs no hat-specific metadata. The current geometric primitives cover an ellipsoid crown with a vertical transition and axis-aligned clearance regions. Other accessory shapes can extend this contract with additional generic primitives. This is geometric fitting, not a simulation of individual strands or cloth.

## Surface fitting

A rigid head declares a `surface` family (`face-v2`) and a socket-local XY frame `[centerX, centerY, width, height]`. Fitted parts declare their authoring frame, target slot, matching surface family, separation and maximum fitting distance. Coordinates are metres, Y up, +Z forward. Scout and Spark have different face widths, heights and depths.

The library maps the part's XY coordinates into the selected head frame and projects against the exported triangles. In `surface` mode, painted expressions sit 1.5 mm radially above the skin and the mustache has a 5.5 mm front-projection offset. In `clearance` mode, a rigid front retains its shape and moves along +Z to reserve the declared separation. Contact uses overlap polygons between head and accessory triangles, including their edge intersections. A long bridge cannot pass through the nose merely because its original vertices were outside it.

Glasses additionally declare `projection: "wrap"` and `sideOffset: 0.003`. Their exported meshes carry semantic `fitRole` extras: `front` for the rims and bridge, `side` for the temples. The Blender exporter preserves these groups when joining meshes. Only the front determines the rigid forward translation. The sides then clear the actual head and ears along outward ±X, with a separate 3 mm margin. A rear temple cannot push the entire frame far forward to satisfy a front-axis ray test.

The side solver checks complete projected triangle overlaps. When a sparse side face spans a curved temple, it splits that face locally and projects the new contact samples outward. It interpolates every vertex attribute, uses a 0.1 mm contact tolerance and 0.2 mm refinement reserve, and stops at a bounded depth and geometry budget. Each new vertex also carries private interpolated source coordinates: `maxDistance` bounds the full source-to-final movement, including the earlier front translation, rather than each correction independently. Unresolvable contact fails before committing an appearance. Missing roles, side triangles crossing the head centerline and invalid offsets fail explicitly. These roles belong to the accessory, independently of the hair selected.

The editable Blender preview shares the same front/side roles and projection directions. The public runtime additionally performs triangle-interior qualification and local contact refinement; final compatibility evidence comes from that runtime.

A surface family is a geometric contract. New heads must provide an appropriate frame and pass surface tests. Accessories need sufficient tessellation to follow facial curvature. Missing surfaces, projection failures, invalid volumes and excessive fitting distances return explicit errors while retaining the previous appearance.

## Integration

```ts
const look = defaultRecipe(library.catalog);
Object.assign(look.parts, {
  head: "head-spark",
  hair: "hair-pony",
  facialHair: "facial-mustache",
  eyewear: "acc-glasses",
  headwear: "hat-club-cap",
});
await avatar.setAppearance(look);
```

The same recipe works with asynchronous instances, prepared factories, the illustrated renderer, PNG portraits and directional captures. Mustache color uses the existing hair palette channel.

Recipes require the matching catalog revision; this alpha kit does not migrate old look data. Interaction contracts ship with the versioned asset catalog so authoring changes and runtime behavior are reviewed together.

## Evidence

Automated checks use actual exported triangles to measure mustache separation, minimum and maximum glasses-to-skin gaps, and two-way edge/surface intersections for glasses/head and hair/cap. For glasses and hair, the invariant is complete geometry preservation, including the cap-fitted state; requiring zero triangle intersections would enforce the wrong physical behavior. Procedurally generated wide and tall hair fixtures exercise shapes the asset builder has never seen. A separate sphere with deliberately sparse long temples and bridge exercises triangle-interior fitting beyond the authored heads. Tests also cover accessory removal, cache reuse, independent instances, all vertex attributes and indices, and contradictory interaction contracts.

The studio browser suite exercises simultaneous selection and persistence. `evidence/reference-v2/browser-components.png` contains historical front, oblique, profile and rear captures from the public runtime. Structural recipe sweeps and final-assembly checks enforce the existing 14,000-triangle, 1.5 MB and 12-part appearance limits. The exhaustive equipment test reports the current maximum fitted triangle count; bytes and hashes are generated in `public/catalog.json`.
