# Snap Salute · original reusable emote

A 2.4-second nonlooping acknowledgement: lift the relaxed right hand to the
outside of the temple, make a small upbeat nod, flick outward and settle back.
The existing fifteen moving bones, fixed limb lengths and unarticulated hand
mesh are retained. There is no claim of independently animated fingers.

## Concept and implementation evidence

- [Individual concept drawing](references/snap-salute/concept.png) and [exact prompt/provenance](references/snap-salute/provenance.json)
- [Actual runtime pose, front](evidence/snap-salute/salute-front.png)
- [Actual runtime pose, side](evidence/snap-salute/salute-side.png)
- [Actual runtime outward flick](evidence/snap-salute/flick-front.png)
- [Lean build in the long jacket](evidence/snap-salute/lean-front.png)
- [Full build in the long jacket](evidence/snap-salute/broad-front.png)
- [Captured recipes and geometry counts](evidence/snap-salute/runtime-assemblies.json)

The five images above are **Blender review renders of evaluated AvatarLibrary
vertices** loaded from the exact exported GLBs and posed through the real
runtime. Their review shading is deliberately separated from the shipping
ComicStyle WebGL renderer. They are neither concept-art stand-ins nor claims of
browser capture. The [actual Chromium sequence](evidence/snap-salute/browser-actual-sequence.png)
and [in-app studio screenshot](evidence/snap-salute/browser-studio.png) were
captured by the passing focused CI run on `d209c443`, downloaded with the exact
artifact digest verified, and pixel-inspected. The separate
[browser provenance](evidence/snap-salute/browser-verification.json) records the
run, source head and file hashes. Both browser tests pass, including the new
control after running and mobile control containment.

## Assets and authorship

- Authoring targets: `assets/source/performances/snap-salute/keyframes.json`
- Deterministic bake: `scripts/build-snap-salute.mjs`
- Runtime asset: `src/snap-salute-data.ts`, with a portable source copy in `baked-clip.json`
- Editable action: `assets/source/performances/snap-salute/snap-salute-action.blend`
- Rebuild action: `assets/source/performances/snap-salute/build_action.py`
- Packed, editable posed geometry review: `assets/source/performances/snap-salute/posed-review.blend`

The seven authored pose targets are original project work; no third-party
animation clip was copied or retimed. The authoring solver bakes 145 normalized
quaternion frames at 60 Hz onto the established rig. Runtime interpolation uses
the existing bounded performance sampler. The source `.blend` is a rig-only
editable action with timeline markers and a packed concept reference; the
separate posed review file contains the actual assembled mesh. Seven Blender
action checkpoints match the target-rig matrices with a maximum position error
of 0.00000194 m and no measured quaternion-angle error.

## Runtime and studio use

`avatar.playEmote("snap-salute")` starts local playback once. Continue the normal
update loop. The existing caller-owned `Motion.emote` timeline can seek it with
`{ id: "snap-salute", elapsed }`. The descriptor is exported in
`emoteDescriptors`, so existing performance control panels discover it. SHIFT
also has a Salute button; selecting it returns the preview gait to Idle before
playing. Paused animation requires an explicit resume.

Equipment still stows before the hand is used and restores the same selected
owner afterwards. Deliberate movement or physical action interrupts playback;
reduced motion uses a static representative salute with the same bounded
lifetime. No recipe, inventory or world-position authority is added.

## Validation and a corrected handoff defect

Local verification passes 167 unit tests, type checking, formatting and the
production build. Dedicated checks cover:

- The unchanged exact bone order, finite normalized rotations and matching start/end poses
- 1,305 timeline frames across three builds and three tops, with 333 full skin-continuity snapshots
- Actual shoe vertices at or above the floor, fixed bone translations/scales and invariant horizontal foot contacts
- Real one-hand and two-hand equipment ownership, stow/restore, movement cancellation and reduced motion
- Editable Blender action matrices against the same baked runtime poses

The first timeline sweep found a 5.6 mm sideways corrective step when a full-body
emote returned to idle. The old idle solver eased a previous 1 mm shoe-support
height before applying its near-extension reach clamp. A narrow runtime fix
resets the idle target on that handoff. The final tested horizontal contact
change is below 1e-6 m without changing the rig, runtime budgets or foot solver.

The Node checks evaluate geometry and fitting; their PNG loader reads metadata,
not pixels. Browser CI separately decodes the textures and exercises the actual
shader. Source skin continuity is a bounded edge test, not exhaustive cloth or
self-collision simulation. The pose is qualified on the current reference
family and tested garments; arbitrary future hair and headwear are not promised
to clear every hand trajectory. The static head expression is a selected face
asset, not a facial animation authored by this emote.

## Reproduce

1. `node scripts/build-snap-salute.mjs`
2. `node --import tsx --test tests/snap-salute.test.ts`
3. `blender -b --python assets/source/performances/snap-salute/build_action.py`
4. `node --import tsx scripts/export-snap-salute-evidence.ts /tmp/snap-salute-runtime`
5. `blender -b --python assets/source/render_snap_salute.py -- /tmp/snap-salute-runtime`
6. `ZMAP_BROWSER_CHANNEL=chromium npx playwright test tests/browser/snap-salute.spec.ts`

No merge or deployment is part of this proposal.
