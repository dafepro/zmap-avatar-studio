# Two-handed field tools

The independent [field workbench](http://localhost:5180/action.html) previews three substantial devices with the same appearance runtime. [Action Yard](http://localhost:5173/action.html) consumes the package and connects their effects to ZMap's shared simulation. Equipment stays separate from the saved avatar recipe.

| Device        | Model                                                                      | Interaction in Action Yard                                                                                                                 |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Tether Winch  | Angular protective cage, visible wound drum, cable guide, two rear grips   | Hold to claim and reel one existing loose object within reach; release to pitch it. Competing winches cannot own the same object.          |
| Rebound Panel | Convex board, protective rim, segmented face, rear handles                 | Hold to brace. Incoming objects rebound; teammates meeting the front receive a forward boost.                                              |
| Wake Driver   | Upright actuator, connected handle frame, compressing shaft and broad foot | Press to charge a ground pulse that lifts and pushes nearby objects and players. Cooldowns and recipient immunity bound repeated impulses. |

The driver produces a radial impulse after a short charge. Its expanding visual ring illustrates that event; it is not a separate traveling collision wave. The foot projects the pulse downward from its carried position.

## One object, two grip frames

`public/action/catalog.json` is the separate `zoomap-field-tools` catalog, version 1/revision 1.0.0. It contains three devices and copies of the two existing power-grip hands. The earlier five-item catalog remains usable independently.

```ts
import {
  WieldLibrary,
  WieldController,
  emptyWieldLoadout,
  fieldToolBehaviors,
} from "@zmap/avatar-studio";

const equipment = new WieldLibrary(catalog, baseUrl);
const controller = new WieldController(avatar, equipment, fieldToolBehaviors());
await avatar.setAppearance(recipe);
await controller.setLoadout({
  ...emptyWieldLoadout(catalog),
  twoHanded: { item: "wield-tether-winch", primary: "right" },
});
controller.press("right");
controller.release("right");
// End equipment ownership before releasing the avatar or shared libraries.
controller.dispose();
```

Ordinary `left` and `right` slots must both be null for a two-handed loadout. A two-handed item cannot be placed in an ordinary slot. `getHand("left")` and `getHand("right")` expose distinct gripping hands, but share one item root and one behavior/effect owner. The primary hand selects input ownership; changing it does not mirror the item or exchange physical handles. Support-hand input cannot duplicate an action.

The manifest's `twoHanded.grips` names two actual GLB nodes. `twoHanded.hold` mounts the device relative to `chest`. This collection uses a carry transform of `[0, -0.20, 0.30]`, physical grips at `[-0.21, 0, 0]` and `[0.21, 0, 0]`, identity grip orientations, Y up and +Z forward. Both handles have a 20 mm radius and a 110 mm clear palm zone. Supports sit outside the finger zone. Additional tools may author different measured frames within the rig's validated reach.

The runtime solves each arm against the complete grip transform. It preserves all bone translations and scales and rejects unreachable poses before committing a new loadout. Elbow and wrist limits prevent a numerically coincident grip from requiring an impossible bend. A behavior can provide bounded chest-local `objectPose` deltas; both arms solve again against the moved object. Grip nodes and their ancestry remain protected from arbitrary behavior mutation. Moving internals such as the spool and piston belong under separate named nodes.

Equipment transactions preserve the previous complete loadout until replacement assets and both poses pass. Appearance replacement, stale requests, disposal, hidden state and behavior failures release the shared owner once and restore both relaxed hands. Applications await `setAppearance` and `setLoadout` before reporting initial equipment readiness.

## Presentation and simulation

`fieldToolBehaviors(readState?)` animates the authored mechanisms. With no callback, its input drives a local inspection preview. A world integration supplies accepted phase/progress from its simulation. This callback never applies force or creates durable inventory. The root example maps a simulation tool ID to an approved `wield-${id}` asset and draws a tether to the accepted target. The reusable avatar package does not import ZMap or a transport.

See [the world action contract](../../docs/field-tools.md) for intent ordering, cooldowns, shared ownership and authority limits.

## Reference-to-model workflow

1. Generate isolated front, side, top and back references with consistent dimensions, grip zones and restrained materials. Exact prompts and generated-source paths are in [provenance](references/action/provenance.json). These are authoring references, not evidence of modeled geometry.
2. Execute `reference_kit.py` through interactive Blender MCP. It invokes `action_kit.py` and `action_items.py`, exports the independent catalog and packs all three references into the dedicated editable scene. Only tagged reference-kit objects are replaced.
3. Render `render_action_views()` from the same unchanged objects, inspect each view, correct actual geometry and repeat. The first driver pass exposed detached handle mounts: four transverse bridges now connect them to the casing outside the palm zone. Painted foot vents are clipped to each actual surface triangle so they cannot disappear behind an intervening facet. Winch mount and drum seams overlap structurally instead of relying on outlines to conceal gaps. The panel’s rear braces follow the actual shell facets with a measured overlap, eliminating the detached rods exposed by the browser top view.
4. Load the shipping GLBs in the browser, solve both arms, and review front, side, back, top and assembled views across body builds, primary hands and motions. Exact complete grip matrices, immutable limb lengths, resource budgets and cleanup are automated separately from visual judgment.
5. Save the dedicated scene with `bpy.data.libraries.write(..., {scene}, fake_user=True, compress=True)` to `assets/source/reference-kit.blend`. The source contains 27 packed image dependencies and 92 cameras. Generated concepts are packed alongside the measured component views, not substituted for them.

The complete field catalog is 260,140 bytes, including both reusable gripping hands. [Actual browser trio](evidence/action/browser-hero.png) shows the final assembled devices.

Actual source renders: [winch](evidence/action/blender-winch-front.png), [panel](evidence/action/blender-panel-front.png), [driver](evidence/action/blender-driver-front.png). Browser studies and measured pose results are written under `docs/evidence/action/` by `tests/browser/action.spec.ts`.

The three devices have 1,164 / 760 / 636 source triangles. Each device is limited to 1,200; the two gripping hands add 922. The combined held limit remains 2,200 triangles and 200,000 bytes, with 512 effect triangles and 16,000 visible source triangles for the complete avatar. Outlines add their own rendering pass. Device geometry, not a numeric likeness score, is the reviewable result.
