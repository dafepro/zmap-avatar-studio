# Avatar contract v1

## Ownership and serialization

A recipe contains only `version`, `catalog`, `revision`, `rig`, `parts`, `colors`, and optional `body: { weight: number }`. Every catalog slot is present; optional slots use `null`. Color values are six-digit hex strings keyed by declared material channels. Asset URLs, scripts, identity, ownership, entitlements and inventory are not recipe fields. The consuming application validates access to parts and persists accepted recipes; the runtime validates structure, compatibility and rendering budgets.

Catalog revision and rig IDs must match exactly. A mismatched import fails visibly and does not replace the existing appearance. Catalog assets have IDs, a single slot, socket attachments, named color channels, compatibility tags, a relative GLB path, SHA-256, byte count and triangle count. Catalogs are trusted application configuration. Recipes are untrusted input. Hashes pin bytes to the catalog; they do not authenticate the publisher of the catalog itself.

## Geometry and extension

The current rig is `athlete-reference-v2`, catalog revision 2.0.0. It replaces the earlier alpha rig and includes 11 slots with independent facial hair, eyewear and headwear. Its coordinates are metres, Y up, +Z forward, floor at Y=0. Attachment transforms are local to the named socket, not world-space. Socket hierarchy is parent-first, and a garment may attach several independent segments. The base body contains complete anatomy. Declared garment coverage hides torso, upper-leg and foot regions underneath selected clothes. Heads declare a face-surface family and frame; fitted expressions and accessories adapt to the selected head. See [accessory fitting](accessory-fitting.md) for the deformation contract.

To add a part:

1. Author its geometry on the source rig and test front, side, back and animated fit.
2. Group socket-local geometry under unique attachment nodes; name palette materials using catalog channels.
3. Export a self-contained GLB. Rigid socket parts and explicitly declared shared skins are supported. Textures must be explicitly declared, embedded PNGs; external buffers/images, animation and required extensions are rejected.
4. Generate hash, byte and triangle counts and declare the attachment nodes in the catalog.
5. Run contract and visual checks, and release the assets and catalog revision together.

Weighted parts declare `skin: { bones: ["root", "hips", ...] }`, use one root attachment and name their bones after catalog sockets. Up to 32 bones and four skins per asset are supported, with normalized four-weight influences and finite inverse binds. Exported rest positions must match the catalog within 2 mm. The runtime clones and rebinds each garment to the instance's shared socket skeleton, including differing Blender bone orientation bases. The source builder solves garment blend weights over mesh adjacency, avoiding abrupt chest/arm boundaries. Exposed skin is grouped by connected anatomical region. Covered body meshes carry `avatarRegion` extras and remain available for inspection; selected `covers` regions are hidden at assembly.

Painted parts declare `texture: { maxDimension: 1024, maxCount: 1 }` (absolute limits 2048 and four). The loader validates PNG dimensions and GLB containment before decoding; a failed decode rejects the appearance. Face artwork lies on one smooth fitted surface with alpha revealing the skin beneath. New texture styles retain the same palette and recipe boundary.

New slots and palette channels are data-driven. A new animation behavior, skeletal rig or geometry effect requires an explicit runtime extension; arbitrary catalog code is never executed. `tags` and `excludesTags` express known incompatible combinations. The reference kit supports 11 slots: head, face, hair, facialHair, eyewear, headwear, shirt, bottom, shoes, accessory and effect. It has two fixed effect implementations, orbit and spark.

The launch catalog caps an assembled avatar at 14,000 source triangles, 1.5 MB and 12 parts including its body. Loader-wide limits additionally bound catalog size, GLB nodes/accessors, attachment counts and individual file size. The heaviest tested fitted combination is 13,862 triangles; current per-asset counts and bytes are in `public/catalog.json`.

## Body volume and expression projection

`body.weight` is finite in [-1, 1]. It requires a catalog `bodyShape` contract: a bounded torso `weightProfile`, `leanFactor`, and up to eight limb fields. Each limb names a connected nondegenerate socket chain, `radius`, `falloff`, terminal `endMargin`, and a bounded profile of `[fractionAlongChain, tissueGain]` pairs. The terminal gain must be zero. Shape changes expand tissue perpendicular to limb centerlines without moving the skeleton. All parts sample the same rest-space field; no per-weight garments or height setting are involved. Overall height and floor contact remain fixed. See the reference workflow for the visual correction that motivated this contract.

The optional `bodyShape.neck` field names a socket, negative `bottom`/`top` height offsets, a radial influence `radius`/`falloff`, and bounded `gain`. It expands neck and collar tissue about that socket axis with smooth vertical transitions; it does not scale the face or move the head. Catalogs without this field retain their prior behavior.

Surface fitting defaults to front projection. A face may declare `projection: "radial"` with `mode: "surface"`; actual horizontal head cross-sections then support cheek/profile paint. Material extras `expressionProjection: "front" | "profile"` enable an authored camera-angle transition in both lit and illustrated materials. This is a built-in bounded behavior, never catalog-provided shader code. Front and profile art share one embedded atlas. Missing surfaces and excessive fitting distances reject the whole candidate.

## Loading and lifecycle

`AvatarLibrary` validates and clones the catalog, fetches exact bounded files with a 10-second timeout, checks self-contained GLB structure and SHA-256 before parsing, and caches at most 32 ordinary template promises. Prepared synchronous factories additionally retain one template per approved asset until library disposal; this is bounded by the validated catalog, and exposed as `preparedAssets` in diagnostics. Failed requests leave the cache so a user can retry. No substitute asset is silently selected.

`setAppearance` loads a complete candidate before committing it. The latest request wins. Failed or superseded loads leave the previously committed appearance intact. Instances own separate geometry, materials, texture objects and skeleton state so disposing one does not damage another. `dispose()` cancels library requests or prevents an instance's pending appearance from resurrecting its scene, as appropriate.

`prepare` preloads an approved recipe and returns a synchronous instance factory for consuming engines. Keep the library alive while creating instances; the factory rejects after library disposal. `asCharacter` is a structural ZMap adapter with no import from ZMap. Motion is presentation-only and never changes authoritative world position.

## View treatment

`ComicStyle` supplies three cel light/shadow families and a skinned silhouette hull, 1.45 drawing-buffer pixels by default. The head shades as a unified volume; painted facial features keep their authored colors. The studio uses orthographic projection in this mode and perspective in Studio mode. The optional sixteen-view capture freezes one complete equipped avatar and pose into one atlas. Camera, rendering style and capture state are not appearance or multiplayer state.

See [illustrated rendering](illustrated-rendering.md) and [directional projection](directional-projection.md) for APIs, bounded resources and limitations. Actual exported meshes have deformation checks during wave and run; real WebGL checks cover texture decoding, skinning, shader contrast, repeated appearance/style swaps, atlas alpha and resource cleanup. Full-room phone performance remains a consuming-application qualification task.
