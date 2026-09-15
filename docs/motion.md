# Directional motion and physical action presentation

`AvatarInstance.update(time, motion)` now accepts avatar-facing `velocity: {x, z}` in metres per second, `grounded`, and a generic bounded `pose` containing `crouch`, signed `lean`, `stance`, `tuck`, and `recoil`. Existing `speed` / `gesture` previews retain treadmill animation. These inputs never apply a world impulse or move the application's physical body. Invalid non-finite values reject before changing the pose. The reference rig keeps its height and limb lengths.

Walking now uses **Quaternius Universal Animation Library Standard `Walk_Loop`**, under CC0. Runs and strafes retain **KayKit Character Animations 1.1** `Running_A`, `Running_Strafe_Left` and `Running_Strafe_Right`. The walking selection, original samples, comparison candidates and adaptation are documented in [`assets/source/locomotion/relaxed`](../assets/source/locomotion/relaxed/README.md). Original KayKit GLBs and audits remain in [`assets/source/locomotion/kaykit`](../assets/source/locomotion/kaykit/README.md). Source mannequins never ship as player models; local baked curves need no animation CDN.

`node scripts/retarget-locomotion.mjs` rebuilds the curves from checked-in samples. It reflects +X-left into the catalog's −X-left, converts world rest frames into target local rotations, aligns actual catalog bind vectors, and preserves authored limb directions and the reference model's bone lengths. Physical wrists and palm bones are distinct. Playback pace is measured from the **retargeted** foot travel because this model has proportionally longer shins than the source. The baked six-clip set also retains `Walking_A` for comparison; `node scripts/retarget-walking.mjs` separately rebuilds the active Quaternius walk.

The runtime blends complete poses in a four-cardinal blend space, with support/extension phases aligned before blending diagonals. Speed and directional weights smooth independently: reversing a velocity vector must not cancel the gait speed and accidentally switch a sprint into a walk. Backward motion has no angular ±π seam, and ankles are never redirected independently of knees. Low-speed side stepping reduces the **entire** lateral pose to 42% amplitude and adjusts its cadence; at sprint speed it reaches the authored strafe. The source strafe intentionally crosses the trailing leg and keeps that knee modestly bent; its supporting leg extends.

The free pack has no authored backward sprint. The high-speed backward pose is an explicitly derived **reverse playback of the complete `Running_A` pose**, blended from full-stride reversed `Walk_Loop` walking. No claim is made that this is a separately authored backward-run clip. `animationDiagnostics().locomotion` reports the dominant source `clip`, its actual sampled `phase`, absolute `playbackRate`, `reversed`, and `transition`. Source review can therefore sample the exact same pose without reversing the phase twice. `Rest` is the approved neutral fitting/stopped/reduced-motion pose.

Actual shoe convex hulls determine support height after assembly and body fitting. Walking stays grounded; source running flight timing is adapted to a maximum 7 cm of flight rather than scaling the toy mannequin's toe height into half-metre hops. A continuous contact envelope prevents out-of-phase diagonal blends from hovering for an entire cycle. Brief support locks may translate the visual carrier by at most 6 cm and release smoothly; **the authored joint rotations remain intact**, with no locomotion leg IK, limb stretch or crouch inserted to rescue an unreachable warped stride. Contact flags describe conservative ankle locks, not every rolling heel/toe contact. Flexible socks still follow shin/ankle skin; see [articulated footwear](articulated-footwear.md).

The update order is authored body pose and foot correction, chest/head action pose, registered held-object counter-rotation, both arm/grip solutions, then mechanism/effect updates. No joint translation or scale changes. Moving the assembled root keeps the head, face, hair, clothes and chest equipment coherent. Equipment continues to own its two hands exclusively; an empty equipment controller leaves the complete authored gait intact. A two-hand carrier declares `controlsCarrierPose` only while it actually owns an equipped carrier frame. The carrier chest compensates source pelvis rotation so strafe hip yaw cannot turn a held tool away from the application's aim. The ordinary relaxed-hand pose is restored on removal. The app smooths its final aimed heading through the shortest angle and computes local velocity against that displayed heading. Preview gestures use 2.2 m/s for `walk` and 5.4 m/s for `run`; explicit legacy `speed` still maps 0–1 to 0–4 m/s.

The native opposing strides also exposed a real skin-weight seam: the pelvis midline abruptly switched its remaining influence from the left thigh to the right thigh. The reference generator now blends those thigh weights continuously across the central 10 cm. [`reweight_pelvis.py`](../assets/source/reweight_pelvis.py) imports the published body into a dedicated interactive Blender scene, edits its vertex groups and writes only the corresponding joint/weight payloads back into the original GLB. The correction changes 43 vertices (374 bytes); geometry, topology, materials, bind matrices and asset size remain identical. The saved editable scene is `assets/source/pelvis-weight-continuity.blend`. A 6,912-pose deformation sweep covers all six shirts, three builds, eight running directions, transitions, free hands and an actual held panel, including the pelvis/chest counter-twist.

The consuming action adapter maps authoritative Wake phases to anticipation, tuck, descending preparation, impact, recoil and settling. Body Y and airborne motion come from the actual simulation. `FieldToolPresentation.carrierPitch` supplies the current chest pitch so the driver counter-rotates around its grip axis and strikes with a level plate. Its small authored hold offset remains inside the shared wrist/reach limits. A `pulse` event alone creates the world-space shock ring and twelve bounded dust instances; reduced motion hides the dust. Rebound Panel has a shield-sized amber edge, translucent field, and an accepted-event ripple/kickback. Its controller effects total 120 triangles. Local presses cannot invent accepted impact feedback.

## Reusable emotes

`AvatarInstance.playEmote(id)` starts one bounded performance. Call it once per request and continue the ordinary `avatar.update(time, motion)` loop. `cancelEmote()` fades out local playback. Full-body entry and exit use 0.18-second and 0.2-second blends. The public `emoteDescriptors` list supplies each ID, label, total duration, and loop eligibility.

| ID      | Authored source                |                              Total playback |
| ------- | ------------------------------ | ------------------------------------------: |
| `wave`  | KayKit `Waving`                |                               2.133 seconds |
| `cheer` | KayKit `Cheering`              |                               1.667 seconds |
| `dance` | Quaternius UAL1 `Dance_Loop`   | 3 seconds: three authored one-second cycles |
| `yes`   | Quaternius UAL2 `Yes`          |                                 2.5 seconds |
| `no`    | Quaternius UAL2 `Idle_No_Loop` |               2.5 seconds: one source cycle |

```ts
avatar.playEmote("wave");
// In the existing render loop; all times are seconds:
avatar.update(appTimeSeconds, { velocity: { x: 0, z: 0 } });
// A later user action can end the local performance:
avatar.cancelEmote();
```

A registered equipment controller stows occupied hands before the local emote clock advances, then restores the prior draw intentions after completion or cancellation. New caller intentions take precedence over that restoration. Deliberate movement and physical action poses interrupt local full-body emotes. `animationDiagnostics().emote` reports the ID, elapsed seconds, blend weight, and whether playback is waiting for hands to become free. Reduced motion uses a representative static pose while preserving the bounded lifetime.

For a caller-owned timeline or a seekable preview, pass **`Motion.emote: { id, elapsed }`** on each update. `elapsed` is finite, nonnegative performance time in seconds, distinct from the outer application clock. It takes precedence over local playback for that update; the runtime samples that time instead of restarting the clip. Omit `emote` on later updates to end externally driven playback. Keep one owner for the performance clock.

```ts
avatar.update(appTimeSeconds, {
  velocity: { x: 0, z: 0 },
  emote: { id: "dance", elapsed: 1.4 },
});
```

The five emotes use original authored motion and duration; the dance cycle count is runtime policy. The equipment source is KayKit `PickUp`, uniformly retimed to **0.8 seconds for one hand** and **1 second for two hands**. The baked stow source is exact whole-pose reverse playback. The two-handed variant adds item clearance and secondary-hand constraints to the authored primary-hand reach; it is explicitly an adaptation, not a native two-handed draw. See [draw/stow API and ownership](wielding.md#draw-and-stow-without-changing-the-selection).

Source licenses, unchanged GLBs, original key samples, rejected alternatives, and measured grip/release markers are documented in [`assets/source/performances`](../assets/source/performances/README.md). `node scripts/retarget-performances.mjs` rebuilds the compact pose data using the same rest-vector calibration as locomotion. An independent Three loader/mixer check validates 557 original-key poses against the source sampler; runtime interaction and visual qualification are separate. These APIs animate presentation and equipment ownership; application simulation still owns physical movement and item consequences.

## Geometry and timing qualification

The first tilted-plate attempt demonstrated why checking a named ground anchor was insufficient: a forward source vertex could be below the floor while the anchor remained above it. The final browser fixture traverses the actual source vertices and compares the entire plate with the floor, verifies its upward normal and both full grip matrices, and runs the actual physics sequence at weights −1, 0 and +1.

The nine impact samples in `https://github.com/dafepro/zmap/blob/main/docs/evidence/animation/measurements.json` have a lowest plate vertex 7.1–11.6 mm above the floor, with grip matrix error below 1e−14. The leading contact edge is about 0.612 m forward, matching the simulation's 0.6 m strike position to within 12 mm. The plate stays level. The small positive clearance avoids source penetration; these are rendered asset/rig measurements, not a device-performance claim.

`tests/animation.test.ts` qualifies walking/running forward and backward, both strafes and diagonals: stable flat contacts, actual shoe-vertex floor clearance, finite transitions, knee flexion, unchanged bone translations/scales, and appearance/equipment preservation. `tests/locomotion-reference.test.ts` independently compares 1,344 baked limb directions with the original source, checks continuous loop/blend sampling, verifies provenance, and covers empty equipment leases, paused timestamps and appearance replacement. `tests/field-tools.test.ts` qualifies authoritative-only impact feedback, frozen state, reduced motion, rigid source anchors, budgets and disposal. The root browser fixture uses the shipping adapter and simulation and saves front/side locomotion and action filmstrips.

Open the dev-only `http://localhost:5173/review/locomotion.html` route for a playable source/target comparison. `tests/browser/locomotion-review.spec.ts` captures front/side sheets for walk, brisk walk, jog and sprint at weights −1, 0 and +1, plus backward/sideways source comparisons and movement/turn/stop/held-tool transitions. The additional directional browser proof runs 120 cases across eight directions, the backward sign seam, abrupt turns, three weights, both paces, and free/occupied hands. It measures world joint jumps, torso/head posture, per-leg extension, actual shoe support/flight and full equipment frames; see [directional review](https://github.com/dafepro/zmap/blob/main/docs/directional-locomotion-review.md). The source mannequin display is mirrored to match target handedness; its animation data is untouched. Evidence is saved in `docs/evidence/locomotion`. Source comparison images are review material and are not bundled into the consumer package.

## Scope

Foot targets currently use the avatar's grounded root plane. Contact qualification is for level support; there is no arbitrary-terrain per-foot raycast or slope-normal foot alignment. Ramps still use the world's physical support and height, but precise terrain-conforming soles are a separate extension. The visual rig is the fixed-height reference family, not a general retargeter for arbitrary skeleton proportions. Reduced motion suppresses oscillation, recoil and particles while preserving essential static fitting and accepted body movement.

## Continuous gait playback

The runtime reconstructs periodic rotation curves without per-joint damping, and smooths conservative shoe support changes so contact-vertex switches do not jerk the entire character. Rotation controls retain extension poses; root/contact controls receive a symmetric five-sample filter. Ground support smoothing fades out for idle and full-weight emotes. `tests/locomotion-continuity.test.ts` checks the actual FK joint heights at 60/120 Hz and acceleration through the loop seam; floor, limb-length and grip checks remain separate. The repository review `docs/locomotion-continuity.md` records before/after measurements and clearance bounds.

### Moving with active equipment

`Motion.carryLean` is an optional upper-body lean in [-1, 1], eased using the
animation clock. It does not select the full-body action/leg solver. The Action
Yard uses it for panel bracing and winch reeling, preserving the complete sourced
gait and shoe support while the equipment layer owns both hand grips. Full-body
Wake impacts continue to use `Motion.pose`.

Backward diagonals now favor backward travel rather than blending opposing
longitudinal foot strokes. The pelvis and entire leg chain turn together by a
bounded heading offset; chest compensation preserves the upper-body aim frame.
The cardinal strafe and source reverse-run clips remain intact.

### Relaxed walking and backward travel

The regular Quaternius walk replaces the former compact reversed KayKit walk.
Hip swing expands by 15% for the target proportions. Knee flexion and world
ankle orientation remain authored; limb lengths stay fixed. Cadence is measured
from the adapted target foot trajectory. Backward travel reverses this complete
pose at full amplitude, giving longer steps without accelerating a short shuffle.

On the default target at 2.2 m/s, peak knee bend drops from about 130° to 88°,
the trailing knee retains about 12° of bend, and backward foot excursion grows
from 0.69 m to 0.77 m. Head vertical excursion is about 4.9 cm; measured 60 Hz
backward head jerk is about 1,161 m/s³. These are deterministic fixture metrics,
not whole-device frame-performance claims.

Regression checks cover forward/backward knee shape and step reach, eight
movement directions with empty, either, both and shared hand grips, plus the
existing active panel/winch checks at three weights and 60/120 Hz. Browser
review compares original source meshes with the actual avatar at matched phases.
Shoe contact is measured every frame to avoid aliasing brief running contacts.
