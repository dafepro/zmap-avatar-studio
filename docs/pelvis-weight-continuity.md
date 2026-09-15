# Continuous pelvis weights

The native sprint exposed a hard bone boundary in the welded base anatomy. A
16.09 mm edge crossed the body centerline at hip height: one endpoint assigned
its residual thigh influence entirely to the right leg, the next to the left.
Opposite-leg motion stretched that edge to 69.43 mm. The broader directional
review found an edge 46.17 mm beyond the existing continuity allowance at full
weight during a backward sprint. Clothing hid the surface in ordinary views;
the base mesh still needed to deform correctly.

`thigh_weights()` in `assets/source/reference_kit.py` now distributes the existing
thigh influence smoothly across the central 10 cm of the pelvis. It preserves
the existing hip, knee, ankle and foot fields. Beyond that central bridge, each
thigh follows its own leg. This changes 43 vertices and does not reshape the
anatomy or widen the existing deformation allowance.

## Interactive Blender workflow

Run `assets/source/reweight_pelvis.py` through Blender MCP with `__file__` set to
the script path. It imports the current body into its own scene without merging
vertices, applies the same authoring function to Blender vertex groups, and
saves the editable `assets/source/pelvis-weight-continuity.blend`. Other scenes
and assets remain independent.

The narrow publisher verifies every imported pelvis vertex against its original
position, then copies the actual authored joint/weight values into the original
GLB accessors. It asserts that every other byte is unchanged before publication.
It recognizes an already-authored field within float32 weight precision so
repeating the repair does not accumulate rounding changes.
This preserves the source topology, normals, UVs, materials, coverage regions,
bind matrices and compact hand weights exactly, avoiding a complete remesh or
an unrelated glTF round trip. A future complete kit rebuild uses the same field.

The body remains 341,168 bytes and 5,791 triangles. Only 374 bytes changed, all
inside the joint and weight payloads. The complete avatar catalog remains
2,190,020 bytes, below its 2.2 MB budget.

## Qualification

`tests/catalog-deformation.test.ts` checks 6,912 poses spanning all six shirts,
lean/reference/full body weights, eight directions at maximum sprint speed,
heading transitions, and both free hands and the real two-handed rebound panel.
The latter also stresses the waist when the chest counter-rotates against hip
yaw to retain the tool's aim. Covered pelvis/torso surfaces are included along
with exposed anatomy and the visible garment.

The existing edge allowance stays unchanged: three times rest length plus
20 mm for small remeshing edges. The new directional regression fails against
the previous body with a 46.17 mm excess and passes the corrected asset with
6.61 mm remaining margin at its worst edge. The original wave/run regression
and jersey coverage checks also pass. Measurements and payload hashes are in
`docs/evidence/rigging/pelvis-weight-continuity.json`.
