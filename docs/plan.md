# Avatar studio implementation plan

The owner requested an independent application and extensible modular avatar system. This folder is a self-contained package with its own install, lockfile, builds and tests. It is tracked in the parent repository so a clone is complete; `git subtree split --prefix=avatar-studio` can extract its history into a new repository. No nested Git repository or external unpublished submodule is required.

The studio and runtime depend on Three.js, not ZMap or Zoomigo. The app owns approved catalogs and appearance recipes; ZMap can consume the resulting character factory. No accounts, inventory grants, arbitrary script uploads or world physics belong here.

1. Generate a character reference from the supplied Zoomap poster (completed using the built-in imagegen tool; exact prompt retained).
2. Author a coherent modular Blender kit via the Blender MCP background tools. Common physical proportions, semantic attachment pivots, explicit material channels; original heads, faces, hair, shirts, bottoms, shoes, accessories and bounded effects.
3. Implement a versioned catalog/recipe contract with rig/slot compatibility, strict validation, resource budgets and a clear content-authoring path. This first rig uses rigid articulated parts; cloth simulation and deforming skin are future rig versions.
4. Implement an atomic asynchronous assembler: load only selected parts, verify assets, commit a complete look, keep the current look on failed edits, dispose resources, avoid stale-load races.
5. Build a polished studio: orbit/zoom, front/side/back, idle/walk/wave previews, part gallery, color channels, undo/redo, named local looks, import/export JSON and transparent PNG export. Show a small world-scale preview. Honor reduced motion.
6. Validate component combinations, assets, recipe failures, loading races, lifecycle cleanup and public package use. Inspect screenshots at desktop and phone sizes. Record actual art/performance limits.

The image reference is an art target, not proof that the mesh kit matches it. Iterate on in-engine faces and silhouettes before accepting the kit. Actual full-team phone performance remains a separate ZMap qualification.

## Current iteration record

Implemented: independent package and studio; strict versioned recipes; 22 original Blender exports; all eight requested categories; palette editing, named looks, undo/redo, JSON and transparent PNG export; bounded loading, integrity verification, atomic swaps and disposal; public prepared factories; working hub integration; optional comic shading with orthographic projection; interactive Blender and browser review.

Visual passes corrected flat/armored shoulders, body intersections, crude shoe shapes, swept hair silhouette, hidden brows, facial details floating off cheeks, and inward mesh normals exposed by the comic outline. The full illustrated study remains the art target. Further quality work: sculpted hand poses, more distinct heads and hair silhouettes, smooth garment deformation across joints, expressive facial animation, and a reviewed fit matrix for every new asset family. A shader cannot supply these mesh and animation details.

Validation distinguishes all-combination structural checks from sampled visual inspection. Production NFR acceptance requires the parent project's full-room physical-device matrix; see `../../docs/multiplayer-coverage.md`.
