# Avatar Studio

An independent Three.js avatar runtime, original Blender asset kit, and browser design studio. The studio runs without ZMap, an account service, or a database. ZMap's hub is a second consumer of the same package.

```sh
cd avatar-studio
npm ci
npm run dev                 # http://localhost:5180
npm run build               # lib/ package + dist/ standalone website
npm test
npm run test:e2e             # Chrome; use ZMAP_BROWSER_CHANNEL=chromium in CI
npm run test:package
```

Use **Illustrated / Studio** to compare drawing and lit-material views, and front/side/back, turntable and animation controls to inspect fit. Illustrated is the default: continuous shoulder surfaces, drawn facial features, broad soft shading and restrained silhouette ink. **16-view drawing** freezes the equipped look and pose into sixteen transparent views, one every 22.5°. Orbit horizontally to compare the projected result; export its PNG atlas and metadata for a consuming application. Return to live 3D to animate or edit. This capture is a fixed-pose presentation cache, not a substitute for animation.

Export look saves portable appearance JSON; Portrait saves the current rendered view as a transparent PNG. Saved looks stay in this browser. The [avatar study](docs/design-reference-v1.png) is the visual target.

## Consume the runtime

```ts
import { AvatarLibrary, defaultRecipe } from "@zmap/avatar-studio";

const base = new URL("/avatars/", location.href);
const response = await fetch(new URL("catalog.json", base));
if (!response.ok) throw Error("Collection could not load");
const library = new AvatarLibrary(await response.json(), base.href);
const recipe = defaultRecipe(library.catalog);
recipe.parts.hair = "hair-sweep";
recipe.colors.primary = "#782e43";

const avatar = library.create();
await avatar.setAppearance(recipe);
scene.add(avatar.object);
// In your render loop:
avatar.update(elapsedSeconds, { gesture: "walk", reducedMotion: false });
// When the character leaves:
scene.remove(avatar.object);
avatar.dispose();
// When the consumer no longer needs asset templates:
library.dispose();
```

Copy `public/catalog.json` and `public/models/` into your application's static asset path. Serve over HTTPS or localhost: integrity checks use Web Crypto. When developing through a local symlink with a separate dependency install, configure your bundler to resolve a single Three.js copy (Vite: `resolve: { dedupe: ["three"] }`). The working hub demonstrates this setting.

The runtime has no CSS, DOM, renderer, network room, identity, inventory or account dependency. It uses the consumer's Three.js 0.180 instance. Import `@zmap/avatar-studio/core` for recipe validation without Three.js.

For a synchronous world visual factory, preload with `const create = await library.prepare(recipe)`, then return `create().asCharacter()` from ZMap's `visuals.character`. The optional `asCharacter(() => mediaQuery.matches)` argument supplies reduced-motion policy. The app resolves identity and approved looks before calling this factory. See `../examples/models.ts` for a working integration. ZMap owns disposal of meshes in its character scene; an ordinary Three.js consumer calls `avatar.dispose()` itself.

`ComicStyle` is an optional renderer treatment. Call `style.update(avatar.object.children[0], renderer.getDrawingBufferSize(size))` before rendering, and `style.clear()` to restore the original materials. Call `style.dispose()` when leaving. Its outline adds geometry and draw calls; the catalog triangle budget describes the source avatar, not the outline pass. The studio supplies lighting and camera changes separately. Consumers choose their own presentation.

## Package boundary

This directory has its own lockfile, build, tests, public contracts and assets. It is checked into the parent repository so every revision is reproducible without an unpublished submodule. It can be extracted with `git subtree split --prefix=avatar-studio`; no source rewrite is required. A clean packed-consumer test installs the tarball outside this checkout and verifies ESM, declarations, asset assembly and a Vite production build.

## Art and evidence

The original [study sheet](docs/design-reference-v1.png) was generated with the built-in image generator using the user-provided Zoomap poster. The exact [generation prompt](docs/design-prompt.txt) is recorded. The meshes were made in Blender through MCP. Facial detail is now an editable drawn atlas fitted to one continuous face surface; its [source and provenance](assets/textures/README.md) are retained. The editable source is `assets/source/avatar-kit.blend`; `assets/source/build_kit.py` and `assets/source/sculpt.py` rebuild all 22 GLBs, their hash manifest and the representative lineup render.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/source/build_kit.py
```

Run the builder in a background Blender process; it resets that process's scene. Interactive review used an appended review scene and preserved the user's existing MCP Test Scene. Blender 5.2.1 LTS produced the current kit.

Iterations covered swept hair silhouettes, jaw/cheek proportions, visible brows and eyes, sleeves, cloth folds, fingers, layered trainers, socket fit and outward mesh normals. [Visual evidence](docs/evidence/) includes Blender lineups, studio desktop/phone views and comic rendering. All 5,184 recipe combinations pass compatibility and source-budget checks; this is not a claim that all combinations were visually inspected.

The current kit uses smoothly weighted body and garments on a shared skeleton, relaxed sculpted fingers, a softly shaded head and drawn expressions. It approximates the study; the reference still has more deliberate hair masses, asymmetry, hand posing and garment detail. Facial blend shapes, finger animation and a production animation library remain future work. The sixteen-view prototype preserves one equipped look and pose at one elevation; animated and multi-elevation atlases are not implemented.

See [this visual iteration](docs/illustrated-iteration.md), [asset contracts](docs/contracts.md), [illustrated rendering](docs/illustrated-rendering.md), [directional capture](docs/directional-projection.md) and [the iteration plan](docs/plan.md).
