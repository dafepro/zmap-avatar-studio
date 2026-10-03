# Studio capsule: original modular sportswear

This bounded prototype adds two genuinely different tops and one independent wearable to `athlete-reference-v2`. The legacy source rig, runtime, materials contract and existing catalog are unchanged. Descriptors are the three-element array in [`public/capsule/parts.json`](../public/capsule/parts.json), with relative `models/<id>.glb` URLs for an isolated capsule asset root.

## Parts

| Part             | Label                | Exported triangles | GLB bytes |
| ---------------- | -------------------- | -----------------: | --------: |
| `shirt-circuit`  | Switchback jacket    |                456 |    49,968 |
| `shirt-relay`    | Courier varsity vest |                590 |    61,952 |
| `acc-pulse-pack` | Pulse sling pack     |                192 |    28,124 |

- **Switchback jacket:** cropped long-sleeve shell, asymmetric cream sleeve, broad diagonal storm tape, raised lime zipper pull, geometric badge, folded utility pocket, contrast hem/cuffs and reverse chevron
- **Courier varsity vest:** boxy sleeveless outer vest over a dark short-sleeve tee, split raised lapels, contrast shoulder yoke, two voluminous folded pockets, running tabs and reverse double chevrons
- **Pulse sling pack:** independent `accessory` selection, bevelled rear pod, raised panel/chevron, wide shoulder straps and side signal tab. It can be equipped and removed without replacing either shirt

The panels, pockets, collars, sleeves and pack are actual mesh geometry. The capsule uses existing `primary`, `secondary`, `trim` and `accent` palette channels. It adds no textures, image-to-3D placeholder, shader, runtime effect or external asset dependency. Bright graphic street-sport forms are the direction; there are no copied game character meshes or military accessories.

## Source and provenance

Authoring code: [`assets/source/studio_capsule.py`](../assets/source/studio_capsule.py). Editable scene: [`public/capsule/studio-capsule.blend`](../public/capsule/studio-capsule.blend).

The script reads the established rig, mesh and GLB writer definitions from `reference_kit.py` without executing its asset builds. The jacket retains the connected reference shoulder topology and adds a new six-ring long sleeve on each side. The vest's outer shell, separate raised details and pack are newly authored geometry. The approved repository clothing study (`docs/references/clothing.png`) was inspected for proportions and sportswear fit. New silhouette, pocket and panel designs are original additions made for this prototype.

All work ran in the cloud VM with installed Blender 4.3.2. Actual Blender renders were inspected and corrected after the first pass exposed an inner-arm clearance issue. The interactive Blender app was located and inspected, but its input calls returned an unavailable AT-SPI provider error. Authoring/export/rendering therefore used Blender's Python interface in background mode; this is not a claim of an interactive hand-sculpting session.

## Rig, coverage and fitting invariant

- All three parts use one root attachment and the same 16 exact bone names/rest positions as `athlete-reference-v2`; no bone, joint, socket or inverse-bind contract was changed
- Both shirts declare `covers: ["torso"]`; the accessory declares no coverage
- The Courier's tee deliberately supplies the cloth beneath its open armholes. A truly bare-armed vest would require a more granular body-coverage contract, so the prototype does not conceal that distinction
- Tops and accessory sample the existing continuous body-volume field at weights −1, 0 and 1. Height and socket positions remain unchanged
- The long jacket sleeves use explicit topological ownership after the upper shoulder transition. This prevents the legacy short-shirt spatial heuristic from binding a wide hem or inner forearm to the wrong bone
- A chest-bound inner underarm vertex closes the wave-pose gusset; neighbouring shoulder vertices retain blended chest/arm weights. Lower sleeves follow arm, forearm and wrist fields. Pockets/lapels remain torso-bound
- Pack fabric is chest/hips-bound; its broad pod starts behind the widest authored shirt back and its straps follow the shared body field

### Exact attachment and skin declaration

| GLB                         | Attachment node             | Catalog socket |
| --------------------------- | --------------------------- | -------------- |
| `models/shirt-circuit.glb`  | `ref2_shirt-circuit__root`  | `root`         |
| `models/shirt-relay.glb`    | `ref2_shirt-relay__root`    | `root`         |
| `models/acc-pulse-pack.glb` | `ref2_acc-pulse-pack__root` | `root`         |

All three declare the same ordered `skin.bones` list: `root`, `hips`, `chest`, `head`, `arm_L`, `forearm_L`, `hand_L`, `leg_L`, `shin_L`, `foot_L`, `arm_R`, `forearm_R`, `hand_R`, `leg_R`, `shin_R`, `foot_R`. Geometry is authored in root rest space, metres, Y up and +Z forward. The standard loader checks the shared skeleton rest transform tolerance before rebinding the skin.

## Verification

Run from the repository root:

```sh
blender -b --python assets/source/studio_capsule.py
node --import tsx public/capsule/validate-capsule.ts
```

Add `-- --export-only` to the Blender command for a quick geometry-only iteration. The script writes only the capsule subtree; it does not rebuild or overwrite legacy GLBs/catalogs.

[`validation.json`](../public/capsule/validation.json) records 12 real-runtime assemblies: both tops at builds −1/0/1, with the independent pack on and off. They pass bounded asset integrity/loading, rest assembly, finite vertices, source skin rebinding, wave/run poses and edge-continuity checks. With the pack equipped and the highest-source-triangle existing choice in every other slot, both tops also assemble under the unchanged 14,000-triangle / 1.5 MB / 12-part limits: the measured final assemblies are 13,856 triangles for Switchback and 13,990 for Courier. These particular maximum-stack checks use the pack, not the higher-triangle legacy headphones; arbitrary equipment combinations remain subject to the runtime budget check.

Long-sleeve fit additionally tests 196–199 exposed-body arm samples per build in rest, wave and running poses. Every tested sample remains inside the actual skinned jacket triangles. Across these sampled poses, the minimum measured radial shell clearance is approximately 2.3 mm; rest-pose minima are over 11 mm. The check covers the arm band from approximately 1.025 to 1.305 m in the neutral assembly.

Actual geometry images:

- [Front comparison](../public/capsule/capsule-front.png)
- [Back comparison with independent pack](../public/capsule/capsule-back.png)

`runtime-review.ts` provides a 12-view WebGL/cel-shaded review function for the local Vite server. A separate Chromium process could not be launched in this worker: the process sandbox rejects its Unix socket even after the reviewed escalation. These Blender images are verified renders; they are not substitutes for the consuming UI/browser review.

## Honest limits

This is a low-poly authored capsule, not a cloth solver. The arm clearance check samples existing exported vertices, not every triangle interior at every possible animation time. Source construction and sampled motion checks do not prove arbitrary emotes, all arm reach directions, body/gear self-collision or interaction with every future garment. The vest/pack have assembly and deformation checks, but do not yet have an exhaustive inter-garment intersection test. Long hair may naturally overlap the pack. The current low-poly elbow and cuff silhouette is intentionally angular. Phone/full-room performance remains a separate consumer qualification task.

## Pinned GLB integrity

- `shirt-circuit`: `12b73e2c1836c18a1ffec3a71d9fb725985eae9c3de879f7de50dd46034badcc`
- `shirt-relay`: `f864d0818f1255480ffde638128e2a959638147a0cddfe31b3eb8a8522564218`
- `acc-pulse-pack`: `5e5672e3f0c9669701596e4d31ca2c72d599cc98705ff6369d8369edd69ab696`

## Independently reviewed additions

Each new piece can ship its own `public/capsule/parts/<id>.json` record and
`public/capsule/models/<id>.glb`, with its own authoring source, concept and
actual runtime evidence. The builder retains the original three-record
`parts.json`, reads extension records in stable filename order, requires filename
and ID to match, rejects IDs duplicated against either catalog, and checks every
GLB's exact hash/byte count before writing the isolated catalog. Generated
`shift-capsule` tags expose additions in the relevant studio slot, including the
expression selector, without changing the curated legacy choices.

The existing saved-look schema and original catalog remain unchanged. An
additive piece must qualify the existing rig, palette, fit and per-appearance
budgets; adding a descriptor is not permission to relax those contracts.

`npm run dev`, `npm run dev:atelier`, `npm test`, and `npm run build` regenerate
that catalog first, so a piece PR does not need to commit a competing generated
catalog snapshot. The per-piece record and GLB are the authoritative addition.
