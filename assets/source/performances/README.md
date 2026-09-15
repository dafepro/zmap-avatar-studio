# Reusable authored performances

This source set adds five emotes and equipment reach/recover motion. It preserves four **unchanged original GLBs** with their original rigs, mannequins, materials, and animation curves. [provenance.json](provenance.json) records their SHA-256 hashes, original archive paths, licenses, and rejected candidates. All selected content is CC0, acquired from the creators' free downloads. Source mannequins and unused archive clips are development references; the runtime consumes the small baked pose data.

Creator sources: [KayKit Character Animations 1.1](https://kaylousberg.itch.io/kaykit-character-animations), [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), and [Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html). The original license files are preserved beside this document.

## Selected motion

| Runtime ID | Original clip | Source duration | Runtime duration | Policy |
| --- | --- | ---: | ---: | --- |
| wave | KayKit `Waving` | 2.133 s | 2.133 s | One shot; source includes a repeated wave. |
| cheer | KayKit `Cheering` | 1.667 s | 1.667 s | One shot. |
| dance | Quaternius UAL1 `Dance_Loop` | 1.000 s | 1.000 s per cycle | Loopable; runtime bounds the cycle count. |
| yes | Quaternius UAL2 `Yes` | 2.500 s | 2.500 s | One shot. |
| no | Quaternius UAL2 `Idle_No_Loop` | 2.500 s | 2.500 s | One source cycle, presented as one shot. |
| equipOne / stowOne | KayKit `PickUp` | 1.300 s | 0.800 s | Uniform playback retiming; stow reverses the whole source clip. |
| equipTwo / stowTwo | KayKit `PickUp` | 1.300 s | 1.000 s | Same authored primary-hand/body motion; runtime fits the second hand to the actual item. |

The source packs do **not** provide named generic Equip/Unequip clips. `PickUp` is an authored right-handed pickup, not a native inventory draw or a native two-handed pickup. The two-handed variants are explicitly labeled adaptations. Opposite-hand mirroring, item carrier clearance, and secondary-hand IK belong to the runtime. A large item cannot blindly follow the source wrist toward the floor while retaining its ordinary grip spacing.

The grip marker is selected from the original right wrist's minimum world height, at source time **0.56666666 s**. It becomes **0.348718 s** for equipOne and **0.4358975 s** for equipTwo. Reverse playback places release at **0.451282 s** and **0.5641025 s**, respectively. These markers are measured application annotations, not event tracks supplied by the creator. Grip transitions must use the actual item anchors; they do not authorize disconnected hands or penetrating items.

## Source contract and baking

`selection.json` identifies the source clips retained for sampling and comparison. `source-samples.json` contains a separate rest frame and semantic mapping for each source GLB, plus the original TRS samples. Both rigs use +Y up, +Z forward, anatomical left +X. Sampling does not reflect the source or modify curves. It retains the authored endpoint and resets every node before evaluating each new clip.

The KayKit mappings are the same as the locomotion source: `leftHand/rightHand` are the physical wrist joints; `leftPalm/rightPalm` preserve the farther hand joints. Missing intermediate KayKit joints have explicit alias metadata. Quaternius uses physical `hand_l/r` wrists and `middle_01_l/r` as the palm direction for calibration.

`scripts/retarget-performances.mjs` uses the locomotion baker's target bind-vector mapping and X reflection. It calibrates each source against that source's own rest frame. Baked rotations are target-local normalized xyzw quaternions, in the same 15-bone order as locomotion. Pelvis translation is converted by the target/source leg-length ratio. Every frame retains an explicit time; equipment retiming maps the whole source duration uniformly and reverse playback reverses the complete pose, not selected limbs.

All selected motions retain native ground support. Their lowest toe differs from its rest height by less than 1.5 mm; none contains a jump. The baked support value is consequently zero, leaving target footwear grounding to the runtime. The baker does not invent pose curves or overwrite endpoints to manufacture a loop.

The data contract is `performanceData = { bones, clips }`. Each clip contains duration, loop eligibility, category, source metadata, markers, and frames of `{ time, root, rotations, support }`. Runtime policy decides interruptibility, movement ownership, fade durations, number of dance cycles, and equipment visibility. These are separate from the immutable authored motion.

## Reproduce and verify

From the repository root:

```sh
node avatar-studio/assets/source/performances/sample-source.mjs
node avatar-studio/scripts/verify-performance-source.mjs
node avatar-studio/scripts/retarget-performances.mjs
node --import tsx --test avatar-studio/tests/performance-source.test.ts
```

The independent verifier loads the original geometry and skeletal curves through Three's `GLTFLoader` and `AnimationMixer`. It replaces materials only in an in-memory verification copy so Node needs no image decoder. It compares every selected original key against the separate TRS evaluator. [verification.json](verification.json) records **557 verified poses**, with maximum differences below 0.36 micrometres and 0.00000047 radians. This verifies source sampling; runtime transition, equipment, and visual acceptance tests remain separate.

## Alternatives inspected

KayKit provides authored wave/cheer, but no ordinary dance, yes, no, or clap. The matching Quaternius free Standard sources supply the missing emotes. `PickUp_Table` uses the other hand and crosses farther over the torso. Inspection showed `Chest_Open` is also one-handed; its name is not evidence of a two-handed draw. KayKit `Ranged_Magic_Raise` is an overhead one-hand flourish, while `Ranged_2H_Reload` assumes an already-held weapon. These were rejected for generic equipment transitions. Their original archives and inspected provenance remain available without mislabeling their actions.
