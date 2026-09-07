# Illustrated avatar iteration

The avatar study remains the visual target. This pass changes geometry, artwork and presentation together; a postprocess alone cannot recover the study's anatomy or expression.

## What changed

- Rebuilt body and tops with smooth continuous surfaces. Sleeve centerlines follow the outward arm rest pose; a broad collarbone surface removes the disconnected shoulder-cap profile. Covered skin is trimmed beneath required clothes.
- Replaced coordinate-threshold weights with anatomical connected components for exposed skin and a surface-graph blend over garment shoulders. The initial rebuilt mesh tore badly during waves; actual exported-mesh continuity checks caught and guided those corrections.
- Sculpted relaxed palms, tapered fingers and an opposable thumb. Hands follow the shared hand sockets; individual finger animation is not implemented.
- Rebuilt the head profile around a projecting chin, an angular jaw/neck break, flatter cheek planes and a restrained nose. The first sharper pass overextended the nose; exact 90° review guided its reduction and the lower mouth placement. A geometry regression protects chin projection and broad jaw/nose proportions.
- Replaced separately lit facial primitives with one head envelope and a fitted transparent expression surface sharing the exact head topology, preventing ink clipping around the new nose. Larger almond eyes, tapered brows, irises and mouth marks are authored in editable SVG. The image-generated face study is inspiration only: its checkerboard was baked into RGB, so the runtime uses independently verified true-alpha artwork.
- Added a palette-relative garment wash for underarm/waist folds and stitch marks. This adds drawn detail without protruding triangle shards or a baked shirt color.
- Replaced four-band polygon shading with a broad smooth light/shadow treatment, unified head lighting, quiet stable pigment and thin skinned contour ink. GPU contrast tests prevent the early ramp from flattening all front-facing surfaces into one color.
- Added a sixteen-view capture, preview and PNG/JSON export. Each capture records the complete equipped look and frozen pose, with view selection every 22.5 degrees. A single plane replaces the live geometry only while explicitly previewing that capture.

## Boundaries

The live modular mesh provides animation and arbitrary camera elevation. The captured atlas contains one pose and one elevation. It preserves the authored look; it does not generate new hand-drawn anatomy or expressions. The studio uses 512-pixel tiles for enlarged inspection; the reusable API defaults to 256-pixel tiles for smaller world views. Both are bounded and explicitly disposable.

The kit contains 22 assets totaling 1,426,104 bytes before HTTP compression. The largest supported appearance has 13,234 source triangles and 681,148 bytes. All 5,184 combinations fit the existing 14,000-triangle and 1.5 MB appearance limits. This structural sweep is not a claim that all combinations were visually inspected.

The study still has more deliberate hair masses, head variation, asymmetry, expressive posing and garment design. Current hands are relaxed static sculpts; current expressions are fixed artwork choices. These are the next art-authoring limits, not tasks a shader can automatically solve.

## Review evidence

The current editable Blender source packs the facial and cloth images. The background builder regenerates all GLBs and their pinned manifest. Interactive review appends a separate scene, preserving existing user scenes. Browser and Blender views were checked after each material geometry change.

- [Earlier illustrated view](evidence/before-illustrated.png)
- [Exact front / side / three-quarter head study](evidence/illustrated-head-study.png)
- [Current outfit lineup](evidence/illustrated-lineup.png)
- [Current illustrated studio](evidence/studio-comic.png)
- [Current Blender lineup](evidence/blender-lineup.png)
- [Sixteen-view preview](evidence/studio-directional.png)
- [Rendering contract](illustrated-rendering.md)
- [Capture contract](directional-projection.md)

Validation includes actual exported shoulder deformation, GLB/PNG bounds, source budgets, real WebGL skinning and texture decoding, image/skeleton ownership, repeated swaps, capture cancellation/export, isolated packed-consumer rendering, and the parent hub's multiplayer and lifecycle regressions. Full-room physical-phone performance qualification remains separate.
