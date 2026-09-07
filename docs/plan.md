# Avatar studio implementation plan

The owner requested an independent application and extensible modular avatar system. This folder is a self-contained package with its own install, lockfile, builds and tests. It is tracked in the parent repository so a clone is complete; `git subtree split --prefix=avatar-studio` can extract its history into a new repository. No nested Git repository or external unpublished submodule is required.

The studio and runtime depend on Three.js, not ZMap or Zoomigo. The app owns approved catalogs and appearance recipes; ZMap can consume the resulting character factory. No accounts, inventory grants, arbitrary script uploads or world physics belong here.

1. Generate a character reference from the supplied Zoomap poster (completed using the built-in imagegen tool; exact prompt retained).
2. Author a coherent modular Blender kit via the Blender MCP background tools. Common physical proportions, semantic attachment pivots, explicit material channels; original heads, faces, hair, shirts, bottoms, shoes, accessories and bounded effects.
3. Implement a versioned catalog/recipe contract with rig/slot compatibility, strict validation, resource budgets and a clear content-authoring path. The catalog explicitly supports rigid socket parts, normalized shared skins and bounded embedded painted textures; cloth simulation is outside the current contract.
4. Implement an atomic asynchronous assembler: load only selected parts, verify assets, commit a complete look, keep the current look on failed edits, dispose resources, avoid stale-load races.
5. Build a polished studio: orbit/zoom, front/side/back, idle/walk/wave previews, part gallery, color channels, undo/redo, named local looks, import/export JSON and transparent PNG export. Show a small world-scale preview. Honor reduced motion.
6. Validate component combinations, assets, recipe failures, loading races, lifecycle cleanup and public package use. Inspect screenshots at desktop and phone sizes. Record actual art/performance limits.

The image reference is an art target, not proof that the mesh kit matches it. Iterate on in-engine faces and silhouettes before accepting the kit. Actual full-team phone performance remains a separate ZMap qualification.

## Current iteration record

Implemented: independent package and studio; strict versioned recipes; 24 original Blender exports; eleven independently composable categories; palette editing, named looks, undo/redo, JSON and transparent PNG export; bounded loading, integrity verification, atomic swaps and disposal; public prepared factories; working hub integration; optional comic shading with orthographic projection; interactive Blender and browser review.

The September illustrated pass rebuilt body and tops as smooth deforming surfaces. Arms and sleeves now follow the skeleton's outward rest angle; a continuous collarbone/shoulder surface replaces attached caps. Connected-component anatomical weights and harmonic garment weight interpolation prevent large tears during waves. A subsequent exact-profile review restored a projecting angular chin and jaw, shortened the first overextended nose, and aligned the painted mouth/lip. The face artwork now uses the head’s exact front topology. Precise arm clipping removes decimated skin triangles that protruded through waving sleeves. Relaxed fingers replace block palms; facial geometry is one envelope with a true-alpha illustrated expression atlas. The material now shades the visible hemisphere continuously rather than saturating its front into one color. Sixteen-view capture/export is available as an explicit fixed-pose experiment.

Review gates: real exported skin continuity and rest fit; all 31,104 source-budget/compatibility combinations; real browser texture decode, changing parts while posed, rendering contrast, projection/cancellation/export, cleanup, and isolated packed-consumer rendering. Visual checks are sampled front/side/back and wave views, with retained evidence. The art still needs more deliberate hair shapes, asymmetry, expressive hand poses and a broader authored facial vocabulary before it matches the study's finish. These are visible limitations, not hidden alternate assets.

Validation distinguishes all-combination structural checks from sampled visual inspection. Production NFR acceptance requires the parent project's full-room physical-device matrix; see `../../docs/multiplayer-coverage.md`.

The accessory pass adds a mustache projected onto the selected face and separate eyewear/headwear slots. Accessory-owned volumes fit a single original hair mesh; triangle splitting at field boundaries prevents coarse polygons from bridging a clearance region. No per-hat hairstyle variants are authored or loaded. Actual geometry tests cover all three current hairstyles and unseen wide/tall probes, with hat and glasses independently and together. Fitted geometry stays inside the same 14,000-triangle budget. See [the fitting contract and evidence](accessory-fitting.md).
