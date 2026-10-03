# Kiln Workshop collectible set

An original five-piece ceramic-maker wardrobe for the SHIFT capsule. Warm terracotta workwear, graphite barrel trousers, canvas folds and celadon ceramic accents give it a different silhouette from the earlier sport capsule.

## Five independent pieces

| Slot      | ID                   | Source triangles |
| --------- | -------------------- | ---------------: |
| Headwear  | `hat-kiln-folded`    |              164 |
| Shirt     | `shirt-kiln-apron`   |              438 |
| Bottom    | `bottom-kiln-cuffed` |              713 |
| Shoes     | `shoes-kiln-clogs`   |              592 |
| Accessory | `acc-kiln-maker`     |              572 |
| **Total** |                      |        **2,479** |

The five GLBs total **285,052 bytes**. Each has an independent descriptor under `public/capsule/parts/`. The base catalog, original models and original capsule `parts.json` remain unchanged. The discovered capsule catalog is a build output and is not part of this change.

The [set manifest](../public/capsule/sets/kiln-workshop.json) supplies the five slot/ID/label records, canonical palette and relative [portable SHIFT look](../public/capsule/looks/kiln-workshop.shift.json). That look uses the original Scout head, pony hair and grin face, with no dependency on another asset PR.

A host derives completion with `set.components.every(piece => ownedIds.has(piece.id))`. All five distinct IDs are required, independently of which pieces are currently equipped. The set adds no ownership, inventory, rewards, economy or backend behavior. Tests exercise all 32 ownership subsets, each piece alone, and the full outfit.

## Authoring and fitting

- `assets/source/kiln_workshop.py` authors the five meshes. `assets/source/kiln-workshop.blend` is the editable source scene with the same-resolution JPEG concept derivative packed as a reference image
- The cap is an open-bottom folded shell with a single general ellipsoid containment field. It has a raised diagonal canvas fold, a real thick split brim and a celadon tile. Every original hairstyle remains the selected source mesh; no hair variants or per-hair exceptions exist
- The shirt is a connected short-sleeve workwear shell, with broad lapels and a trapezoid apron terminating above the opposite-thigh split. The apron pocket and straps are actual geometry
- The trousers use a deliberately lowered, authored crotch and separate leg openings. Their exact boundaries join to a knee/calf shell derived from the unchanged reference anatomy, expanded into new workwear planes, then re-topologized. Bone-display helpers created by Blender import are explicitly excluded. The joined interfaces have matching leg ownership; posterior knees retain the anatomical leg/shin field
- Rolled trouser openings begin at 0.359 m. Rigid clog geometry remains below 0.26 m; the calf-following sock reaches 0.355 m and blends shin/foot at the ankle. This preserves the shared mixed-set interface
- The maker case has a slab lid, two capped rolls, cross straps and closed, substantial shoulder webbing. Small buckle and band bevels were simplified to preserve mixed-set headroom

The rig remains `athlete-reference-v2`. The shared **14,000 triangle / 1.5 MB / 12 part** limits are unchanged.

## Actual geometry evidence

The [concept](references/kiln/concept.jpg) and [exact original prompt](references/kiln/provenance.json) are planning art only. The original PNG is preserved separately and pinned by SHA-256 in the provenance record; the repository JPEG changes encoding only. The editable scene and posed review files are compressed, with unused datablocks removed without changing mesh coordinates, topology, weights or materials used by the scene.

`scripts/export-kiln-evidence.ts` loads the real GLBs through `AvatarLibrary`, applies head/hair/body fitting and the native poses, and exports their actual posed vertices and embedded texture bytes. `assets/source/render_kiln.py` imports that geometry into Blender. The resulting [front](evidence/kiln/neutral-front.png), [side](evidence/kiln/neutral-side.png), [back](evidence/kiln/neutral-back.png), [wave](evidence/kiln/lean-wave-pose.png) and [run](evidence/kiln/broad-run-pose.png) are actual fitted geometry. `assets/source/kiln-review.blend` is the editable neutral review scene; `kiln-review-lean-wave.blend` and `kiln-review-broad-run.blend` preserve the actual fitted poses too. Blender's review lighting is distinct from the shipping WebGL treatment.

The dedicated `Kiln Workshop set evidence` workflow uses the actual capsule catalog and shipping `ComicStyle`. It exercises all five independent studio swaps, imports the portable look, and renders front/side/back/run/wave for both heads at build −1, 0 and +1. Reviewed CI screenshots and exact-head provenance are recorded under `docs/evidence/kiln/` after the run completes.

## Qualification and limits

Focused tests verify descriptor integrity, exact rig rest positions, finite normalized skinning, independent swaps, complete looks, both heads, all legacy hair, maximal optional categories, floor support, rigid shoe/cuff envelopes, continuous motion and assembled resource budgets. Two-way actual triangle checks verify head/cap and fitted hair/cap separation. Pose tests retain the original anatomy and body masks.

`tests/helpers/kiln-clearance.ts` separates two questions:

1. All-anatomy triangle crossings, including body regions intentionally hidden by garments and interior concave folds
2. Actually visible skin, tested against exterior cloth depth from eight azimuths, using vertices and triangle interiors

Visibility uses only meshes with an entirely visible ancestor chain. The helper welds actual garment boundary edges and recognizes each leg's lowest open wearing loop. Seeing calf through that real cuff opening is expected; an internal seam higher up cannot exempt a skin leak. No cuff is closed and no extra body region is hidden to satisfy the test.

The [clearance report](evidence/kiln/body-clearance.json) records the exact asset hashes and 21 rest/run/wave states over all three builds. Rest intersections and exterior-shell leaks are asserted absent. Intersections hidden inside a deep concave knee fold remain measured diagnostics: this uses bounded linear skinning, not cloth collision simulation. A separate two-way waist/hem regression covers 36 run/wave samples across all builds, and the finite/continuity sweep covers additional moving frames. These checks do not claim unrestricted physical cloth simulation or full-room phone performance.

## Reproduce

```sh
blender -b --python assets/source/kiln_workshop.py
node scripts/build-capsule-catalog.mjs
node --import tsx --test tests/kiln-workshop.test.ts
node --import tsx scripts/export-kiln-evidence.ts
blender -b --python assets/source/render_kiln.py -- /tmp/kiln-runtime
npm run typecheck
npm run format:check
npm test
npm run build
```

Actual browser and packed-consumer validation run in repository Actions because Chromium launch is unavailable in the authoring VM. No merge or deployment is included.
