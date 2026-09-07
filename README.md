# Avatar Studio

An independent Three.js avatar runtime, editable Blender component kit and browser customization studio. It runs without ZMap, an account service or a database. ZMap's hub is a second consumer of the same package.

```sh
cd avatar-studio
npm ci
npm run dev                 # http://localhost:5180
npm run build               # lib/ package + dist/ website
npm test
npm run test:e2e             # Chrome; ZMAP_BROWSER_CHANNEL=chromium in CI
npm run test:package
```

The current reference kit is catalog **2.4.0**, rig **athlete-reference-v2**. It rebuilds the supplied body, swept hair and sportswear sheets. [Actual browser components](docs/evidence/reference-v2/browser-components.png), [weight comparison](docs/evidence/reference-v2/browser-weight-study.png) and the [documented Blender workflow](docs/reference-workflow.md) show the result and its limits.

Use the **Build** slider for lean through heavier tissue volume at fixed height. Arms and legs grow around their own centerlines; joint positions stay fixed. **Avatar / Base mesh / Hair / Outfit** inspect the assembled look or its components. **Illustrated / Studio** compare cel ink and lit materials. Front, side, back, turntable and motion controls inspect fit.

**Try accessories** equips a mustache, glasses and cap together. One original hair mesh fits accessory-owned volumes, with no per-hat hairstyle variants. Removing equipment restores the original. New assets still need correct pivots and a declared fitting contract; see [accessory fitting](docs/accessory-fitting.md).

**16-view drawing** captures one equipped look and pose every 22.5° into an exportable transparent atlas. It is a fixed-pose cache, not animation. Export look saves appearance JSON; Portrait saves rendered PNG. Saved looks remain in this browser. Catalog 2.4.0 explicitly accepts saved 2.2.0 and 2.3.0 recipes with their selections intact; undeclared revisions fail validation.

## Consume the runtime

```ts
import { AvatarLibrary, ComicStyle, defaultRecipe } from "@zmap/avatar-studio";

const base = new URL("/avatars/", location.href);
const response = await fetch(new URL("catalog.json", base));
if (!response.ok) throw Error("Collection could not load");
const library = new AvatarLibrary(await response.json(), base.href);
const recipe = defaultRecipe(library.catalog);
recipe.parts.hair = "hair-sweep";
recipe.body = { weight: 0.5 }; // [-1, 1], zero is the authored study
recipe.colors.primary = "#f4f1eb";
const avatar = library.create();
await avatar.setAppearance(recipe);
scene.add(avatar.object);
const ink = new ComicStyle();
// Render loop:
avatar.update(elapsedSeconds, { gesture: "walk", reducedMotion: false });
ink.update(avatar.object.children[0], renderer.getDrawingBufferSize(size));
// Cleanup:
ink.dispose();
scene.remove(avatar.object);
avatar.dispose();
library.dispose();
```

Copy `public/catalog.json` and `public/models/` to your static asset path. Serve over HTTPS or localhost for Web Crypto integrity checks. Resolve one Three.js copy when developing through symlinks (Vite `resolve.dedupe: ['three']`). Import `@zmap/avatar-studio/core` for validation without Three.js.

The runtime has no DOM, CSS, renderer, network room, identity, inventory or account dependency. Applications approve parts and persist recipes. For a synchronous ZMap visual factory, preload with `const create = await library.prepare(recipe)`, then return `create().asCharacter()` from `visuals.character`. The app maps identity to approved appearance; ZMap owns world simulation. See `../examples/models.ts`.

## Source and package boundary

This directory has its own lockfile, build, tests and contracts. It can be extracted with `git subtree split --prefix=avatar-studio`; there is no unpublished submodule dependency. The packed-consumer test runs outside this checkout.

The active source is `assets/source/reference_kit.py`, with the editable `assets/source/reference-kit.blend`. The small `build_kit.py` entry point invokes it. The dedicated Blender scene preserves unrelated open work. The workflow documents interactive MCP construction, render corrections, supplied references and generated weight-reference provenance.

The 39-part kit supports 11 slots, two heads, six expressions, interchangeable hair/clothes/shoes, facial hair, eyewear, hats and effects. It approximates the drawings; it is not a claim of final production art. Finger animation, facial blend shapes and a production animation library remain unimplemented. Source limits are 14,000 triangles, 1.5 MB and 12 selected parts; outlines add rendering work. Phone/full-room performance needs qualification by the consumer.

See [contracts](docs/contracts.md), [rendering](docs/illustrated-rendering.md), [directional capture](docs/directional-projection.md) and [reference workflow](docs/reference-workflow.md).

Collection 02 adds Ember, Tide and Volt starter looks, nine independent parts, body-size neck/collar deformation, and packed Blender front/side/top references. See the [workflow and actual render comparisons](docs/collection-02-workflow.md).

Revision 2.2.0 hardens scalp coverage, uses natural hair occlusion for glasses, and separates front-frame from temple fitting. See the [compatibility review and orbit evidence](docs/fit-quality-review.md).

It also rebuilds the three Collection 02 hairstyles against isolated front/side/back/top studies, corrects the ponytail root and improves the original swept nape. See the [hair authoring comparisons](docs/references/hair-isolated/README.md).

Hair 03 adds **Nova ponytail, Halo afro and Reed waves**, bringing the kit to nine hairstyles. Each quick choice preserves the current head, expression, clothing and accessories. Their isolated front/side/back/top concepts, Blender iterations and accessory checks are recorded in the [Hair 03 workflow](docs/hair-03-workflow.md).

The novelty collection adds **Quack Captain**, **Starstruck Specs** and **Pocket Galaxy**. Use their quick choices individually or **Go silly** to equip all three while keeping the rest of your look. The original colors stay fixed when you recolor an outfit. See the [concept-to-Blender workflow and actual browser views](docs/novelty-workflow.md).
