# Authored directional locomotion source

Kay Lousberg's **KayKit Character Animations 1.1**, downloaded from the creator's [Character Animations page](https://kaylousberg.itch.io/kaykit-character-animations), Free 1.1 edition, on September 15, 2026. The unchanged archive license is [LICENSE.txt](LICENSE.txt), CC0 1.0. The two unchanged GLBs include their original matched mannequin meshes, materials, and animation curves. [provenance.json](provenance.json) records original file paths and SHA-256 checksums. These files are development sources, not remote runtime dependencies.

## Selection

| Source clip | Duration | Original samples | Use / finding |
| --- | ---: | ---: | --- |
| Walking_A | 1.067 s | 33 | Slow-walk comparison: upright torso and nearly straight support knee. |
| Running_A | 0.800 s | 25 | Selected forward run: 10–20° athletic torso lean and extended support leg. |
| Walking_Backwards | 1.067 s | 33 | Authored backward walk, upright torso. |
| Running_Strafe_Left | 0.800 s | 25 | Authored lateral run with intentional crossover steps. |
| Running_Strafe_Right | 0.800 s | 25 | Authored opposite lateral run with intentional crossover steps. |
| Walking_B | 1.067 s | 33 | Selected default walk: longer stride fits 2.2 m/s with natural cadence; small backward torso tilt. |
| Walking_C | 1.600 s | 49 | Comparison candidate; approximately 10 mm source loop seam. |
| Running_B | 0.800 s | 25 | Rejected: deeper knee fold and a 56° source foot rotation step at 60 Hz. |
| T-Pose | 0 s | 1 | Bind-pose comparison and rig calibration. |

The free source has no authored backward run or lateral walk. Any backward run made by reversing `Running_A` is a derived adaptation and must be labeled as such. It is not an original backward-running clip. Replaying lateral running more slowly also remains a playback adaptation.

## Coordinate and rig contract

The untouched glTF world frame is **+Y up, +Z forward, anatomical left +X**. Sampling performs no reflection, limb reshaping, target fit, or foot correction. The source has 23 joints. `source-samples.json` exposes the existing semantic names plus separate palms:

| Semantic names | Original KayKit joints |
| --- | --- |
| root / pelvis / lowerSpine / chest / head | root / hips / spine / chest / head |
| leftUpperArm / leftForearm / leftHand / leftPalm | upperarm.l / lowerarm.l / wrist.l / hand.l |
| rightUpperArm / rightForearm / rightHand / rightPalm | upperarm.r / lowerarm.r / wrist.r / hand.r |
| leftThigh / leftShin / leftAnkle / leftToe | upperleg.l / lowerleg.l / foot.l / toes.l |
| rightThigh / rightShin / rightAnkle / rightToe | upperleg.r / lowerleg.r / foot.r / toes.r |

`midSpine`, `neck`, both clavicles, and both toe ends are explicitly marked aliases because the source has no corresponding separate bones. They are not invented authored joints. **Target hand attachment rotation must use the physical `wrist` mapping, not the farther `hand`/palm joint.** Hand-slot joints are not needed for the target's separate equipment socket system.

Rest leg length is **0.376515 m**, hips height 0.405663 m, and head-joint height 1.241425 m. The short source legs and long upper body differ substantially from Zoomap. Preserve target anatomy and calibrate movement pace after target forward kinematics; scaling every source position uniformly will distort those proportions.

## Reproduce and inspect

From the repository root, with its installed `three` dependency:

```sh
node avatar-studio/assets/source/locomotion/kaykit/sample-source.mjs
node avatar-studio/assets/source/locomotion/kaykit/measure-source.mjs
```

The sampler evaluates all original TRS channels at the union of their original key times (30 Hz for these clips), retaining the closed-loop endpoint. Positions are world xyz metres and rotations are normalized world xyzw quaternions. Nodes reset to original bind transforms before every clip; the two packs' rest frames must agree.

`source-contact-measurements.json` records knee extension, torso tilt, loop seams, source contact estimates, and world-bone continuity. Its skin check reconstructs the original sole vertices within 0.35 micrometres at rest. It preserves authored heel/shin skin influences rather than pretending the entire source foot is rigid.

Contact phases are **measurements, not authored contact events**. The original mannequin's sole penetrates its native floor by roughly 61 mm in Walking_A and 64 mm in the strafe clips. Consequently a clip-wide lowest-sole threshold does not reliably identify heel strike. Low-toe phases provide useful alignment evidence: Walking_A left support is approximately 0.125–0.438, Running_A 0.125–0.250, backward walk 0.562–0.906, and strafe around 0.208. A half-cycle shift aligns backward walking's supporting leg with forward walking. Ground contact must be solved and checked against the actual target shoes.

Authored lateral runs cross the knees. A blanket no-crossover rule would reject the source choreography. Check the target's actual mesh clearance, joint continuity, and transitions instead. At playback 1.0, selected source clips have maximum leg-bone steps of 10.2–24.6° per 60 Hz frame; a continuity gate must account for playback rate.

## Other sources inspected

The [GDQuest mannequin](https://github.com/gdquest-demos/godot-3d-mannequin/tree/d48a4fdb49a3930f38cdbeb854cf5be3ae4b6b2a), inspected at commit `d48a4fdb49a3930f38cdbeb854cf5be3ae4b6b2a`, provides useful forward walk/run references but its inspected GLBs lack backward and lateral clips. Its artwork is CC-BY 4.0, unlike this CC0 source. Quaternius free Standard packs used previously also leave the directional gap. No paid export service, signup-only library, or third-party re-export was needed for the selected clips.
