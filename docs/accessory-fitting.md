# Accessory fitting

Facial hair, eyewear and headwear are independent optional slots. The host application supplies one recipe; the avatar runtime performs fitting before committing the appearance.

## One source mesh per hairstyle

Accessories own deformation volumes. A hat describes its interior once, and that field packs the crown of any selected hair mesh into the available space. The field blends out below the brim, leaving lower hair free. The same original ponytail folds under the crown and remains visible behind the head. The cap has an actual rear opening. There are no hairstyle IDs, compatibility tags, replacement meshes or per-hat hair variants in this process.

Round glasses describe a clearance region around their fitted frame. Hair in that region moves behind the frames. Head changes move and scale this region with the glasses. Crown containment runs before eyewear clearance in a stable order independent of recipe key order. Clearance constraints repeat to a fixed point with a bounded iteration count; conflicting fields fail explicitly.

Triangles crossing a deformation boundary are split there and their attributes interpolated. This prevents a long triangle from bridging across a clearance region even when its original vertices were outside it. Geometry is fitted once at assembly time. Animation and camera movement use the resulting mesh without per-frame collision work. The final geometry must still fit the catalog triangle budget.

All edits apply to instance-owned geometry. Removing the accessory rebuilds from the same cached original hair mesh. Other avatars and prepared factories retain their original geometry. Wearing a hat does not fetch another hair file or change the selected hairstyle ID.

A new accessory needs a fitting envelope appropriate to its own geometry; a new hairstyle needs no hat-specific metadata. The current volume primitives cover an ellipsoid crown with a vertical transition and axis-aligned clearance regions for frames and temples. Other accessory shapes can extend this contract with additional generic volume primitives. This is geometric fitting, not a simulation of individual strands or cloth.

## Surface fitting

A rigid head declares a `surface` family (`face-v1`) and a socket-local XY frame `[centerX, centerY, width, height]`. Fitted parts declare their authoring frame, target slot, matching surface family, separation and maximum fitting distance. Coordinates are metres, Y up, +Z forward. Scout and Spark have different face widths, heights and depths.

The library maps the part's XY coordinates into the selected head frame and projects against the exported triangles. In `surface` mode, painted expressions sit 0.8 mm above the skin and the mustache sits 3 mm above it. In `clearance` mode, the glasses retain their structure and move as a whole to reserve 16 mm from the closest sampled face surface. The arms wrap around the temples.

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

Catalog revision 1.2.0 introduces these slots and moves round glasses to `eyewear`. Recipes require the matching catalog revision; this alpha kit does not migrate old look data.

## Evidence

Automated checks use actual exported triangles to measure mustache separation, glasses clearance and two-way edge/surface intersections between hair, cap and glasses. Procedurally generated wide and tall hair fixtures exercise shapes the asset builder has never seen. Tests also cover accessory removal, cache reuse, independent instances and invalid contracts.

The studio browser suite exercises simultaneous selection and persistence. `evidence/accessory-study.png` contains unretouched front, oblique, profile and rear captures from the public runtime. Structural recipe sweeps and final-assembly checks enforce the existing 14,000-triangle, 1.5 MB and 12-part appearance limits. The heaviest tested fitted look is 13,700 triangles; the complete 24-file kit is 1,357,736 bytes.
