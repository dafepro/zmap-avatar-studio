# Authored locomotion source

The selected walk, jog, sprint and idle clips are by Quaternius, under CC0 1.0. The creator's pack page also credits animator Gonzalo Furnier. The original license and readme wording is retained here; line endings and trailing whitespace are normalized for the repository.

`quaternius-ual1-locomotion.glb` is a source review asset containing five untouched clips (`A_TPose`, `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`), the original 65-joint rig and the author's mannequin. Import it into Blender to compare the original motion with the separately retargeted Zoomap avatar. The mannequin is not used as a player model and this source folder is not shipped by the avatar package.

See `provenance.json` for source URLs, versions, archive hashes, exact file hashes and modifications. `source-rest-frames.json` exposes all local and evaluated world bind frames in Y-up, +Z-forward coordinates. `inspect_reference.mjs` regenerates it using the repository's Three.js dependency.

## Reproduce extraction

Download the free Standard archive from [the creator](https://quaternius.itch.io/universal-animation-library), extract it locally, and pass its `Unreal-Godot/UAL1_Standard.glb` file to:

```sh
python3 extract_reference.py /absolute/path/to/UAL1_Standard.glb quaternius-ual1-locomotion.glb A_TPose Idle_Loop Walk_Loop Jog_Fwd_Loop Sprint_Loop
node inspect_reference.mjs
```

The extractor selects original animation records and repacks the referenced buffer views. It does not resample, normalize, retarget or change geometry. The produced file was checked against the original: all 1,950 selected sampler input/output byte sequences match; the nodes, rest transforms, skin inverse binds, mesh indices and vertex attributes also match.

The source's global root is stationary in these in-place clips, while the pelvis still carries the authored weight shift. Its root-motion companion, retained outside the repository for calibration, travels 1.3 m per walking cycle, 5 m per jogging cycle and 5.5 m per sprinting cycle. These measurements inform pace and stride adaptation; they do not move the app's physical character.

## Evaluated motion data

`sample_source.mjs` evaluates every original TRS track and writes `source-samples.json`: time samples plus flat position/quaternion arrays for 25 named semantic joints. It retains the source coordinate frame and explicitly records the joint order. It was cross-checked against Three.js `AnimationMixer` using the extracted GLB; checked positions agreed within 0.000000253 m and normalized rotations within 0.000040 degrees.

`measure_contacts.mjs` writes `source-contact-measurements.json` from that dataset. Its conservative flat-toe criterion excludes heel-only stance and toe-off. The planted-toe pace is approximately 0.9794, 5.898 and 8.905 m/s for walk, jog and sprint at the source playback rate. These are more useful pace measurements than assuming the root-motion companion has perfect ground-contact agreement. Preserve the distinction between flat-toe fraction and full stance duration.

```sh
node sample_source.mjs
node measure_contacts.mjs
```

The original walk loop closes exactly. The other selected moving/idle loops have a small original left forearm/hand seam. If a retargeter closes the seam, record that in its own output provenance; the source data here remains unchanged.
