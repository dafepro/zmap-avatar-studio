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

The current reference kit is catalog **2.5.0**, rig **athlete-reference-v2**. It rebuilds the supplied body, swept hair and sportswear sheets. [Actual browser components](docs/evidence/reference-v2/browser-components.png), [weight comparison](docs/evidence/reference-v2/browser-weight-study.png) and the [documented Blender workflow](docs/reference-workflow.md) show the result and its limits.

**[Field Tools](http://localhost:5180/action.html)** adds Tether Winch, Rebound Panel and Wake Driver: one shared object held by two fitted hands. Inspect body builds, primary-hand ownership, views and mechanisms in the workbench; try their real shared forces in [Action Yard](http://localhost:5173/action.html). The [two-hand contract and Blender workflow](docs/field-tools.md) describe the independent optional catalog and integration.

Use the **Build** slider for lean through heavier tissue volume at fixed height. Arms and legs grow around their own centerlines; joint positions stay fixed. **Avatar / Base mesh / Hair / Outfit** inspect the assembled look or its components. **Illustrated / Studio** compare cel ink and lit materials. Front, side, back, turntable and motion controls inspect fit.

**Try accessories** equips a mustache, glasses and cap together. One original hair mesh fits accessory-owned volumes, with no per-hat hairstyle variants. Removing equipment restores the original. New assets still need correct pivots and a declared fitting contract; see [accessory fitting](docs/accessory-fitting.md).

Walking, sprinting, backward steps and strafing use retargeted Quaternius walking and KayKit running/strafe CC0 poses, a continuous directional blend space, actual shoe support and occupied-hand pose ownership. Backward sprint is an explicitly derived reversed run. Pass avatar-facing `velocity: {x, z}` in metres/second to match physical movement; preview `walk` and `run` gestures use 2.2 and 5.4 m/s. In Action Yard, hold Shift or use the Sprint toggle. The dev-only [motion comparison](http://localhost:5173/review/locomotion.html) shows source and target together. See [motion and retargeting](docs/motion.md) and [third-party attribution](THIRD_PARTY_NOTICES.md).

Use `avatar.playEmote("wave")` for a bounded wave, cheer, dance, yes or no performance, and `cancelEmote()` to end it. Dance plays three authored cycles. A registered equipment controller clears and restores the hands around the emote; `Motion.emote: {id, elapsed}` supports an explicit playback time in seconds. `hands.setDrawn(false)` stows selected equipment, and `setDrawn(true)` draws it again without reloading assets or changing the selection. One-hand transitions take 0.8 seconds and two-hand transitions take 1 second, using an explicitly documented pickup adaptation. See [emote timing](docs/motion.md#reusable-emotes) and [draw/stow controls](docs/wielding.md#draw-and-stow-without-changing-the-selection).

**16-view drawing** captures one equipped look and pose every 22.5° into an exportable transparent atlas. It is a fixed-pose cache, not animation. Export look saves appearance JSON; Portrait saves rendered PNG. Saved looks remain in this browser. Catalog 2.5.0 explicitly accepts saved 2.2.0, 2.3.0 and 2.4.0 recipes with their selections intact; undeclared revisions fail validation.

## Install the released runtime

```sh
npm install --save-exact https://github.com/dafepro/zmap-avatar-studio/releases/download/v0.1.1/zmap-avatar-studio-0.1.1.tgz
```

The package remains private to prevent accidental npm-registry publication. Built GitHub Release tarballs contain runtime/declarations and approved assets; editable Blender source stays in this repository. Commit your application's lockfile.

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

The runtime has no DOM, CSS, renderer, network room, identity, inventory or account dependency. Applications approve parts and persist recipes. For a synchronous ZMap visual factory, preload with `const create = await library.prepare(recipe)`, then return `create().asCharacter()` from `visuals.character`. The app maps identity to approved appearance; ZMap owns world simulation. See [zmap’s character adapter](https://github.com/dafepro/zmap/blob/main/examples/models.ts).

## Source and package boundary

This is the independent repository [dafepro/zmap-avatar-studio](https://github.com/dafepro/zmap-avatar-studio), with its own history, lockfile, CI, builds and releases. zmap pins it as a development submodule. Consumers install the built release tarball and serve the approved assets through the exported `@zmap/avatar-studio/assets/*` paths; they do not need a zmap checkout. The packed-consumer test runs outside this repository.

The active source is `assets/source/reference_kit.py`, with the editable `assets/source/reference-kit.blend`. The small `build_kit.py` entry point invokes it. The dedicated Blender scene preserves unrelated open work. The workflow documents interactive MCP construction, render corrections, supplied references and generated weight-reference provenance.

The 39-part kit supports 11 slots, two heads, six expressions, interchangeable hair/clothes/shoes, facial hair, eyewear, hats and effects. It approximates the drawings; it is not a claim of final production art. Finger animation and facial blend shapes remain unimplemented. Motion currently covers the documented directional gaits, five authored emotes, and equipment reach/recover adaptations. Source limits are 14,000 triangles, 1.5 MB and 12 selected parts; outlines add rendering work. Phone/full-room performance needs qualification by the consumer.

See [contracts](docs/contracts.md), [rendering](docs/illustrated-rendering.md), [directional capture](docs/directional-projection.md) and [reference workflow](docs/reference-workflow.md).

Collection 02 adds Ember, Tide and Volt starter looks, nine independent parts, body-size neck/collar deformation, and packed Blender front/side/top references. See the [workflow and actual render comparisons](docs/collection-02-workflow.md).

Revision 2.2.0 hardens scalp coverage, uses natural hair occlusion for glasses, and separates front-frame from temple fitting. See the [compatibility review and orbit evidence](docs/fit-quality-review.md).

It also rebuilds the three Collection 02 hairstyles against isolated front/side/back/top studies, corrects the ponytail root and improves the original swept nape. See the [hair authoring comparisons](docs/references/hair-isolated/README.md).

Hair 03 adds **Nova ponytail, Halo afro and Reed waves**, bringing the kit to nine hairstyles. Each quick choice preserves the current head, expression, clothing and accessories. Their isolated front/side/back/top concepts, Blender iterations and accessory checks are recorded in the [Hair 03 workflow](docs/hair-03-workflow.md).

The novelty collection adds **Quack Captain**, **Starstruck Specs** and **Pocket Galaxy**. Use their quick choices individually or **Go silly** to equip all three while keeping the rest of your look. The original colors stay fixed when you recolor an outfit. See the [concept-to-Blender workflow and actual browser views](docs/novelty-workflow.md).

**Held items** add Bubble Comet, Bonk Bouquet, Firefly Lantern, Doodle Rocket and Whirl Pop. Choose either hand in the studio, hold Q / E or the action buttons, or open the [toy playground](http://localhost:5180/wield.html). One model per item fits both reusable gripping hands. Independent behavior instances preserve the other hand when you change an item. The optional catalog and controller keep equipment separate from saved appearance. See the [public API, behaviors, Blender workflow and qualification](docs/wielding.md).
