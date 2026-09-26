# Playtime wearables

Catalog 2.7.0 adds three original, interchangeable pieces on the existing
`athlete-reference-v2` rig. Studio offers individual quick choices and **Go
playtime**, which combines the three while preserving the rest of the current
look. Existing 2.2–2.6 recipes remain accepted.

| Piece      | Part               | Reference                                          | Editable construction                                                                |
| ---------- | ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Frog Days  | `hat-frog-days`    | [Frog hat](references/playtime/frog.png)           | Open bucket shell, cream brim edge, forest band, raised eyes and stitched smile      |
| Bolt Mode  | `acc-bolt-mode`    | [Lightning frames](references/playtime/bolt.png)   | Open yellow rims, extruded lightning corners, blue wrapped temples                   |
| Melon Club | `shirt-melon-club` | [Watermelon jersey](references/playtime/melon.png) | Connected coral jersey, green bindings, mint rind stripe, five front/four back seeds |

The built-in image generator used the actual [Court collection browser
render](evidence/court-collection/turnaround.png) as its proportions and style
reference. [Exact prompts and provenance](references/playtime/provenance.json)
are retained with all three generated sheets. Reference images are design
targets; verification images render the exported GLBs.

Run [playtime_collection.py](../assets/source/playtime_collection.py) through
interactive Blender with `__file__` set to that path. It replaces only the
dedicated Playtime scene and three exports, preserving other open scenes and
existing assets. [playtime-collection.blend](../assets/source/playtime-collection.blend)
retains editable mesh, material and rig data. For a complete kit rebuild, run
`reference_kit.py`, then `court_collection.py`, then `playtime_collection.py`.

The frog hat uses the existing tested crown-containment ellipsoid and an open
wearing edge above its transition. Its shell clears the entire envelope,
including polygon interiors; there is no hidden bottom cap intersecting hair.
The glasses use actual-face clearance/wrapping and preserve hair through natural
occlusion. Their outer lightning corners curve back toward the cheek to avoid
floating in front of the face. The jersey's rind uses material regions in the
connected cloth; seed vertices project onto the actual cloth before skinning.
Fixed colors keep the three playful motifs recognizable under palette changes.

All three pieces stay below the existing largest part in their respective slots.
The per-avatar limits remain 14,000 source triangles, 1.5 MB and 12 parts. The
complete 48-part catalog remains below the existing 2.5 MB download gate.

`tests/browser/playtime-study.spec.ts` checks individual and combined Studio
choices, mobile 320 layout, actual fitted turnarounds and native sprint poses.
Evidence lives in [turnaround](evidence/playtime/turnaround.png),
[sprint](evidence/playtime/sprint.png) and accompanying geometry metadata.
The catalog's general fitting/deformation tests include these new pieces.
