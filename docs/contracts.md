# Avatar contract v1

## Ownership and serialization

A recipe contains only `version`, `catalog`, `revision`, `rig`, `parts`, and `colors`. Every catalog slot is present; optional slots use `null`. Color values are six-digit hex strings keyed by declared material channels. Asset URLs, scripts, identity, ownership, entitlements and inventory are not recipe fields. The consuming application validates access to parts and persists accepted recipes; the runtime validates structure, compatibility and rendering budgets.

Catalog revision and rig IDs must match exactly. A mismatched import fails visibly and does not replace the existing appearance. Catalog assets have IDs, a single slot, socket attachments, named color channels, compatibility tags, a relative GLB path, SHA-256, byte count and triangle count. Catalogs are trusted application configuration. Recipes are untrusted input. Hashes pin bytes to the catalog; they do not authenticate the publisher of the catalog itself.

## Geometry and extension

The launch rig is `athlete-rigid-v1`: metres, Y up, +Z forward, floor at Y=0. Attachment transforms are local to the named socket, not world-space. Socket hierarchy is parent-first, and a garment may attach several independent segments. The shared body supplies exposed limbs and neck; the required shirt and bottom supply the covered torso/hips. Heads share the face/hair mounting envelope.

To add a part:

1. Author its geometry on the source rig and test front, side, back and animated fit.
2. Group socket-local geometry under unique attachment nodes; name palette materials using catalog channels.
3. Export a rigid, self-contained GLB with no textures, external buffers, skinning, animation or required extensions.
4. Generate hash, byte and triangle counts and declare the attachment nodes in the catalog.
5. Run contract and visual checks, and release the assets and catalog revision together.

New slots and palette channels are data-driven. A new animation behavior, skeletal rig or geometry effect requires an explicit runtime extension; arbitrary catalog code is never executed. `tags` and `excludesTags` express known incompatible combinations. The launch kit supports eight slots: head, face, hair, shirt, bottom, shoes, accessory and effect. It has two fixed effect implementations, orbit and spark.

The launch catalog caps an assembled avatar at 14,000 source triangles, 1.5 MB and 12 parts including its body. Loader-wide limits additionally bound catalog size, GLB nodes/accessors, attachment counts and individual file size. Actual kit totals are recorded in `evidence/build.json`.

## Loading and lifecycle

`AvatarLibrary` validates and clones the catalog, fetches exact bounded files with a 10-second timeout, checks self-contained GLB structure and SHA-256 before parsing, and caches at most 32 template promises. Failed requests leave the cache so a user can retry. No substitute asset is silently selected.

`setAppearance` loads a complete candidate before committing it. The latest request wins. Failed or superseded loads leave the previously committed appearance intact. Instances own separate geometry and materials so disposing one does not damage another. `dispose()` cancels library requests or prevents an instance's pending appearance from resurrecting its scene, as appropriate.

`prepare` preloads an approved recipe and returns a synchronous instance factory for consuming engines. Keep the library alive while creating instances; the factory rejects after library disposal. `asCharacter` is a structural ZMap adapter with no import from ZMap. Motion is presentation-only and never changes authoritative world position.

## View treatment

`ComicStyle` replaces color materials with toon materials using a four-band nearest-filter gradient. Welded position normals produce thin inverted-hull outlines without flat-shading cracks. Face and effect meshes are excluded from hull outlines to retain small details. The studio uses orthographic projection in this mode and perspective in Studio mode. Camera and shader choices are not persisted as appearance or multiplayer state.

These effects are implemented against Three.js 0.180: see the [official toon material documentation](https://threejs.org/docs/#api/en/materials/MeshToonMaterial). GPU resource checks cover repeated appearance and style changes. Full-room phone performance remains a separate consuming-application qualification task.
