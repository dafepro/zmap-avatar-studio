# Relaxed walking reference

Selected: Quaternius Universal Animation Library Standard `Walk_Loop` (CC0).
Creator: Quaternius / Tomás Laulhé; the creator credits animator Gonzalo Furnier.
Official source: https://quaternius.com/packs/universalanimationlibrary.html

The untouched GLB, license and archive SHA-256 provenance are retained in
`../../performances/UAL1_Standard.glb`, `LICENSE-Quaternius-UAL1.txt` and
`provenance.json`. No source mannequin is a runtime avatar asset.

Candidates sampled from the retained Standard libraries: `Walk_Loop`,
`Walk_Formal_Loop`, `Walk_Carry_Loop`. Regular walking gave a soft trailing knee
and lower swing knee; formal walking straightened the rear knee too much, while
carry walking retained more crouch and vertical travel.

Reproduce from the repository root:

```sh
node avatar-studio/assets/source/performances/sample-source.mjs avatar-studio/assets/source/performances/walking-selection.json avatar-studio/assets/source/locomotion/relaxed/source-samples.json
node avatar-studio/scripts/retarget-walking.mjs
```

The bake converts original world frames onto catalog bind vectors, reflects
source handedness, widens the regular walk's sagittal hip swing by 15%, and
compensates ankle rotation to preserve authored world foot orientation. Local
shin rotations are unchanged, preserving knee flexion. Target foot travel sets
cadence. Ground fitting supplies support; walking has no flight envelope.
Runtime reversal supplies backward travel, rather than a separately authored
backward source. Periodic smoothing and existing directional blends remain.

`locomotion-review.html` loads the actual original source GLB alongside the
rendered modular avatar. Its independent loader verifies original joint world
positions and rotations at all 40 nonduplicate Walk_Loop keys. Runtime tests
check step reach, knee shape, hand ownership and bounce separately.
