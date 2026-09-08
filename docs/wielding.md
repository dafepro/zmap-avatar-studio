# Held items · two independent hands

The optional handheld system adds **Bubble Comet**, **Bonk Bouquet**, **Firefly Lantern**, **Doodle Rocket** and **Whirl Pop**. One source model works in either hand; two copies can be used together. The shipping integrations are the customization studio and the standalone [toy playground](../app/wield.html), served at `/wield.html`.

Equipment uses a separate `WieldCatalog` and `WieldLoadout`. It does not add appearance slots, multiply the wardrobe combination matrix, or require consumers to download toys. Applications own equipment permissions, persistence, input mapping and world effects. The runtime owns approved loading, attachment, hand poses, presentation behavior, resource limits and disposal.

## Integrate

Copy `public/wield/` alongside the avatar assets. Wait for the avatar appearance to load, then compose the controller with that instance:

```ts
import {
  WieldLibrary,
  WieldController,
  emptyWieldLoadout,
  playfulWieldBehaviors,
} from "@zmap/avatar-studio";

const base = new URL("/avatars/wield/", location.href);
const response = await fetch(new URL("catalog.json", base));
if (!response.ok) throw new Error("Toy collection could not load");
const toys = new WieldLibrary(await response.json(), base.href);
const hands = new WieldController(avatar, toys, playfulWieldBehaviors(), {
  onEvent(intent) {
    app.handleWieldIntent(intent);
  },
  onError(error, hand) {
    app.showEquipmentError(error, hand);
  },
});
await hands.setLoadout({
  ...emptyWieldLoadout(toys.catalog),
  left: "wield-firefly-lantern",
  right: "wield-bubble-comet",
});
hands.press("right");
hands.release("right");
// The existing render loop advances animation, held poses and effects together.
avatar.update(elapsedSeconds, { gesture: "walk", reducedMotion: false });
ink.update(avatar.object.children[0], renderer.getDrawingBufferSize(size));
// On focus loss, interrupted touch, modal entry or suspension:
hands.cancel();
// Dispose the controller before its library; no DOM is owned by the runtime.
hands.dispose();
toys.dispose();
```

`@zmap/avatar-studio/wield-core` exports only data types, validation and limits; it does not load Three.js. `WieldLibrary` uses the same streamed byte bounds, SHA-256 checks, GLB policy and texture ownership as `AvatarLibrary`. Unregistered behavior IDs, unknown or duplicate anchors, incompatible rigs, malformed geometry and exceeded limits fail explicitly.

`setLoadout` stages changed hands and commits the complete candidate atomically. The current pair remains usable while downloads complete. A failed or superseded load cannot clear the working pair. Unchanged ready hands retain their object, held input, cooldown, toggle and effect state. Re-selecting an errored item retries that hand. Independent left/right copies never share mutable behavior state.

`getHand(hand)` exposes the approved item, owned objects, logical anchors and `ready`/`error` state. `diagnostics()` exposes allocation and visibility counts. Appearance changes preserve held owners and reattach them to the new validated wrists. There is one exclusive hand-pose lease per avatar; two controllers cannot silently fight over the same arms.

`setPaused(true)` cancels input and passes a stationary reduced-motion frame. `setVisible(false)` is for component inspection: it detaches the hand layer, restores relaxed anatomy and base poses, and retains allocated equipment/toggle state without advancing it. Re-showing reuses the same items. Visibility and explicit pause are independent. The studio also freezes held input and avatar animation throughout its sixteen-view capture. A renderer that composes its own visibility must respect `isWieldHandCovered(object)` when showing anatomy; this ancestry-aware weak ownership query prevents inspection from exposing a relaxed hand over its grip.

## Five behaviors

| Item / behavior key                 | Interaction                              | Logical anchors | Presentation                                                                                    |
| ----------------------------------- | ---------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| Bubble Comet / `bubble-comet`       | Hold to emit; release stops spawning     | `emitter`       | Six reusable bubble instances; 3.5 emissions/second; 1.45-second lifetime                       |
| Bonk Bouquet / `bonk-bouquet`       | Press for one swing; 0.7-second cooldown | `impact`        | Timed `bonk` intent, bounded arm offset, ten short-lived confetti instances                     |
| Firefly Lantern / `firefly-lantern` | Press toggles illumination               | `light`, `core` | Bright heart, soft halo, three fireflies, one short-range light without shadows                 |
| Doodle Rocket / `doodle-rocket`     | Hold to draw a temporary air ribbon      | `tip`           | Up to 32 points, at most 24 samples/second, 1.6-second lifetime; teleports start a fresh stroke |
| Whirl Pop / `whirl-pop`             | Hold to accelerate; release to coast     | `rotor`         | Independent rotor with bounded angular speed and exponential slowdown                           |

Reduced motion removes bubble/confetti/ribbon movement and rotor animation; the lantern still toggles with stationary fireflies and the bonk still produces its semantic event. Cancellation clears transient input and trails. These are local presentation behaviors. They do not apply damage, award inventory, save drawings, or grant permission to change a shared world.

## Add an item or behavior

Author one GLB with a unique approved root containing all its meshes. Add a named `grip` transform and any behavior anchors. The manifest maps logical names to exact unique node names. `gripAnchor` is independent of the root: a carry handle can have a different frame from a wand. Each item declares an authored hold pose for both hands. No per-hand item export or negative mesh scale is used.

Register trusted code with `requiredAnchors` and `create(context)`. A behavior may implement `input`, `pose`, `update` and `dispose`. Each `create` call owns one instance. `pose` returns bounded additive local Euler offsets for arm, forearm and wrist. Use auxiliary nodes for a rotor, lid or moving decoration. The root-to-grip chain is owned by the fitting system and must remain unchanged. Geometry added by behavior belongs in `context.effects`, within the fixed effect allowance.

`context.effects` is wrist-local. To leave particles or a stroke in the world while the hand moves, retain world positions and convert with `effects.worldToLocal()` on each update. The built-ins demonstrate this. Time arrives from `avatar.update` in seconds: frame delta is capped at 100 ms and discontinuous/non-finite/backward time or gaps beyond 250 ms cancel active input. Do not create unbounded timers, particles, listeners or geometry in a behavior.

Call `context.emit({type, anchor, value})` to publish a bounded intent. The controller adds `hand`, `itemId`, `time`, the triggering input `sequence`, a unique controller-local `eventId`, and the current anchor's world position and +Z direction. Several events may share one input sequence. Host deduplication must combine `eventId` with app-owned session/controller identity. Never treat a client-provided anchor position, item ID or event as proof of authorization, reach or collision. Multiplayer replication and authoritative world consequences belong to the consuming app's integration.

If an extension violates its grip, pose, geometry or event contract, that hand reports an error, retires its owned visual and restores its relaxed hand. The other hand continues. A behavior's `dispose` releases its listeners; the controller frees remaining owned Three.js resources. If the behavior frees an object itself, remove it from the owned subtree to avoid double disposal. ComicStyle participates in this lifecycle, preserves detached live equipment, and updates newly added meshes without restyling an unchanged item every frame.

## Authoring and fit contract

The current content targets `athlete-reference-v2`, appearance revision **2.5.0**, with explicit relaxed hand regions and rigid wrist weights. It accepts saved appearance revisions 2.2.0–2.4.0. Equipment catalog `zoomap-playful-hands` is revision **1.0.0**. Unsupported imports must supply and qualify compatible anatomy; automatic arbitrary-hand reconstruction is not claimed.

All source coordinates are metres, Y-up, +Z front. Blender conversion is `(x, y, z) -> (x, -z, y)`. Two reusable gripping hands share a 20 mm handle radius and a clear 110 mm grip zone. Their wrist-local grip center is `[side * 0.024, -0.073, 0.046]`, where left is −1. Frame Euler XYZ is `[π/2, 0, -side * π/2]`. Fitting uses the full rigid matrix `wristWorld × gripFrame × inverse(authoredItemGrip)`, checking all three axes and positive determinant. Aligning only the center or handle axis is insufficient.

The gripping hands are connected anatomical volumes with curled fingers and an opposing thumb. They replace only their own semantic relaxed-hand mesh, retain the exact wrist attachment ring and recolor with skin. Hands are reusable grip poses, not per-item duplicates. Two-handed tools, articulated finger gestures and arbitrary grip profiles would require additional explicit contracts; they should not be represented as a silent approximation to this power grip.

The five generated [front/side/top/held concepts](references/wield/provenance.json) establish shape and style targets. They are packed in the editable Blender scene and linked in the studio reference viewer. Actual geometry evidence is separate: [Blender items](evidence/wield/review.png), [Blender grips](evidence/wield/grip-review.png), [browser grips](evidence/wield/browser-grips.png) and [active assembled items](evidence/wield/browser-actions.png).

The interactive workflow executes `reference_kit.py` through Blender MCP, which invokes `wield_kit.py`, `wield_grip.py` and `wield_items.py`. It replaces only the tagged reference kit and preserves unrelated work. `render_wield_views()` captures front, side, back and top from the same unchanged model; passing `keys=['lantern']` focuses a pass. The helper restores camera, render settings and visibility. Save the dedicated scene and packed images to `assets/source/reference-kit.blend` after review.

The first render exposed black ink intersections between independent palm/thumb volumes, a jog in the mallet shaft, and dark triangles in the marker stripes. The accepted grip unions the anatomical branches, rebuilds its precise wrist ring and checks triangle-interior handle clearance. The marker uses a shared watertight mesh across color boundaries, eliminating T-junctions. The shaft is straight through the grip; the bubble fins remain outside the open loop. A browser review also exposed an incorrectly rolled lantern: its complete carry frame and wrist compensation now preserve an upright hanging orientation. These fixes change the source, then re-export and re-test the actual GLBs.

## Budgets and qualification

Appearance retains its original 14,000 source-triangle / 1.5 MB / 12-part limits. Optional held content has separate immutable limits: 600 triangles per item, 500 per grip, 2,200 held triangles and 200,000 selected bytes, 512 allocated effect triangles, and 16,000 combined visible source/effect triangles. Event queues allow at most 32 intents per update and 16 per hand. Instanced capacity counts even when instances are hidden or inactive. Ink outlines add a rendering pass and are not hidden inside these source counts.

The actual models are 402 / 470 / 500 / 412 / 312 triangles in table order; left/right grips are 462 / 460 triangles. All seven optional GLBs total approximately 207 KB. The largest pair uses 1,922 held triangles. These limits qualify one equipped avatar's content; they do not establish the full-room physical-phone requirement.

Tests verify strict manifests and integrity failures, atomic races, independent state, disposal, pause/visibility, bad extensions, actual grip frames and handle clearance across 30 item/hand/weight assemblies and 360 moving poses. Browser checks exercise all 36 loadouts, 60 simulated seconds of dual bubbles, reduced motion, GPU allocation stability, focus/pointer/keyboard controls, wardrobe changes and the standalone consumer. The packed-consumer check imports the data-only API, validates all seven shipped GLBs, runs actual behaviors and renders/captures the equipped avatar outside this checkout. See [browser study](evidence/wield/browser-study.json) and [runtime samples](evidence/wield/browser-runtime.json) for measured evidence.
