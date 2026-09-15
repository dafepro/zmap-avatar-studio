# Animation reference attribution

The active local running and strafe curves, wave/cheer emotes, and equipment pickup adaptations derive from **KayKit Character Animations 1.1** by Kay Lousberg, licensed under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

- [Creator's pack and free download](https://kaylousberg.itch.io/kaykit-character-animations)
- [Creator's asset catalog](https://kaylousberg.com/game-assets)
- Source archive hashes, untouched GLBs and license, source sampling and measurements: `assets/source/locomotion/kaykit/` in the repository.
- Original `Waving`, `Cheering`, and `PickUp` sources, licenses, hashes, and independent sampling checks: `assets/source/performances/`.

Derived data reflects handedness, retargets rest frames and fixed limb proportions, and adapts support height. Runtime sampling blends phase-aligned complete poses, reduces slow lateral step amplitude and adapts pace to target foot travel. Backward sprint reverses the whole authored running pose; it is not claimed as an original backward-running clip. The original mannequin is review material, outside the runtime package.

The equipment presentation uniformly retimes `PickUp` to 0.8 seconds for one hand and 1 second for two hands. Stow reverses that complete source clip. Two-handed use adds item-specific carrier clearance and secondary-hand constraints; the original right-hand pickup is not represented as an authored two-handed draw. Measured grip/release markers are application annotations.

## Quaternius performances

The active walking animation uses `Walk_Loop`, adapted with 15% wider hip swing while preserving knee flexion and world foot orientation. Backward walking reverses the adapted full pose. Source selection and reproduction are documented in `assets/source/locomotion/relaxed/README.md`.

The active dance emote uses `Dance_Loop` from **Universal Animation Library Standard** by Quaternius / Tomás Laulhé. Yes and no use `Yes` and `Idle_No_Loop` from **Universal Animation Library 2 Standard**. Both packs are [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The creator credits animator **Gonzalo Furnier** for contributions to the libraries.

- [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html), [creator download](https://quaternius.itch.io/universal-animation-library)
- [Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html), [creator download](https://quaternius.itch.io/universal-animation-library-2)
- Unchanged Standard GLBs and original licenses, archive hashes, semantic sampling, retargeting provenance, and source verification: `assets/source/performances/` in the repository.

Performance retargeting reflects handedness and calibrates original rest vectors to the fixed target limbs. Original emote durations are preserved. Dance repeats its one-second authored cycle three times under the bounded runtime policy. Source mannequins and full archives are development references, excluded from the runtime package.

## Historical locomotion reference

Preserved Quaternius **Universal Animation Library Standard v3** forward-gait references remain in `assets/source/locomotion/`, with their exact provenance and original CC0 license. Those former gait curves and their ankle-warp adaptation are no longer the active locomotion implementation.
