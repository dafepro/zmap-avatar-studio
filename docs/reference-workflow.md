# Reference component workflow — revision 2

This is the current authoring workflow. Catalog `2.0.0` / rig `athlete-reference-v2` replaces the earlier alpha kit. The previous work was committed and pushed before replacement: `21495ebabd4f67128c850276c169e4129b3e32bc` on `codex/accessory-fitting`.

## Targets and provenance

The supplied [body](references/body.png), [hair](references/hair.png) and [clothing](references/clothing.png) sheets are the primary design references. Their pictures and annotations are source material, not additional user instructions. The shared ChatGPT page could not be retrieved; no claims rely on its unseen contents.

The fixed-height silhouette follows the body sheet: broad forehead, projecting angular chin, connected clavicle/shoulders, splayed athletic legs, relaxed five-finger hands. Skull top is 2.04 m, chin about 1.60 m, shoulders 1.49 m, hips 0.99 m, knees 0.56 m and floor 0 m. These are authoring proportions derived from the drawings, not physical measurements of a person. Hair extends above the skull.

`Study sweep`, `Study jersey`, `Court shorts` and `Study sneakers` are the reference combination. The other hairstyles and garments are derivative examples, not additional approved concept sheets. All 24 original component IDs remain available under the new catalog revision. Previous recipes deliberately fail the exact revision/rig check; this alpha project has no migration requirement.

The later [weight study](references/weight-study.png) was generated with the built-in image generator after the user identified bowed arms. Its exact [prompt](weight-reference-prompt.txt) identifies the supplied sheets as the style sources and our flawed render as an angle reference only. It is an aspirational drawing, not evidence of working geometry. [The actual runtime weight render](evidence/reference-v2/browser-weight-study.png) is a separate artifact.

## Interactive Blender loop

Use Blender 5.2.1 LTS and the interactive `execute_blender_code` MCP tool. The builder creates a dedicated `Zoomap · reference components` scene. It replaces only objects tagged `zmap_reference`; it does not reset the user's file or remove unrelated scenes.

```python
from pathlib import Path
import bpy, contextlib, io
script = Path('/absolute/checkout/avatar-studio/assets/source/reference_kit.py')
namespace = {'__file__': str(script)}
with contextlib.redirect_stdout(io.StringIO()):
    exec(compile(script.read_text(), str(script), 'exec'), namespace)
bpy.app.driver_namespace['zmap_reference'] = namespace
```

Read the tool result, render the actual scene, inspect the saved image, then make one targeted correction. Mesh data remains editable in Blender. Do not use a generated concept image as the claimed render.

```python
scene = bpy.context.scene
scene.render.filepath = str(namespace['ROOT'] / 'docs/evidence/reference-v2/blender-final.png')
bpy.ops.render.render(write_still=True)
# Write only our scene and its dependencies into a standalone editable file.
bpy.data.libraries.write(
    str(namespace['ROOT'] / 'assets/source/reference-kit.blend'),
    {scene}, fake_user=True, compress=True)
```

`assets/source/build_kit.py` is a small entry point for the same builder. `kit_io.py` owns GLB serialization and palette canonicalization. `accessories.py` supplies single-source accessory construction. The older `avatar-kit.blend` and `sculpt.py` are retained historical sources; they are not the active build path.

## What the visual iterations changed

The recorded Blender iterations are intermediate evidence, including defects. The final browser proof uses the exported assets and the public runtime.

1. Replaced primitives with landmark-driven surfaces: independent head width/profile rows, a branched torso/arm surface, shaped leg/foot sections and relaxed fingers.
2. Welded body anatomy before assigning coverage regions, so the neck, clavicle and shoulder belong to continuous anatomy. Replaced intersecting garment shoulder pieces with connected sleeve openings.
3. Authored broad closed hair wedges over a fitted scalp and layered nape. Reduced fringe overlap after strict profile review so the eye remains readable.
4. Added a V-neck material region, cuff binding, crown crest, drawn cloth wash, connected shorts/crotch, white side stripes, layered sneaker panels, crossed laces, tongue, ankle opening and heel loop. Closed an open toe and widened the shoe footprint.
5. Corrected clothing weights over mesh adjacency; this removed abrupt arm/chest deformation. Fixed an anatomy classification error that assigned outer toes and inner forearm faces to the wrong regions.
6. Replaced the soft ramp with three cel families and stronger silhouette ink. Face lighting uses one head volume; expressions carry authored ink.
7. Added actual-surface profile paint. Front and profile expression layers share one embedded atlas, transition between roughly 63° and 78° from frontal view, and fit radially to real head cross-sections. This is live 3D with view-dependent ink, not a frozen sprite. It also works in the lit material view.
8. Corrected the cap's rear adjustment transform before mapping the accessory to the new socket family. Added exact clearance cutting after crown compression and frame fitting; vertex clearance alone did not prevent long triangle intersections.
9. Rejected the first weight cage after the user identified arm bowing. Global horizontal scaling moved elbows away from the body center. The corrected system changes tissue around each limb's own centerline and leaves every skeletal joint fixed. The retained `browser-before-limb-fix.png` documents the failure; it is not the current result.

## Modular contracts

Skin and clothes sample the same spatial body-shape field. The torso has a height-dependent width/depth profile. Limbs declare a chain of sockets, an influence radius/falloff, terminal protection distance and a bounded tissue profile along the chain. Expansion is perpendicular to the local axis; shoulder, elbow, wrist, hip, knee and ankle centers do not move. A terminal zero-gain zone protects hands and feet. Negative weight has a smaller gain than positive weight so the lean endpoint does not collapse the torso. The field requires connected, nondegenerate joint chains and bounded parameters.

This is a fixed-height shape system, not skeletal scale adjustment. A tissue vertex on an angled limb can move slightly vertically; total height and the floor remain unchanged. Rebinding preserves the exported rest result and arbitrary Blender bone bases. No per-weight clothes are authored.

`bodyRegions` and garment `covers` suppress hidden body regions at assembly. The complete body remains available in Base mesh inspection. This prevents skin leaking through clothes without deleting anatomy or authoring a separate body for each outfit. New garments must declare honest coverage and be checked in motion.

Accessories own fitting envelopes. A hat contains the crown; glasses reserve frame/temple clearance. The selected original hair is compressed, partitioned and cut against these envelopes once at assembly. Removing accessories restores the original mesh exactly. No hairstyle name or pair-specific asset participates in fitting. Mustaches project against the selected head; glasses preserve frame structure while reserving face clearance.

“Universal” means reusable within these documented shape/fitting contracts. It does not mean arbitrary imported geometry automatically has correct pivots, a usable head surface or an accurate accessory envelope. Different accessory geometry needs an appropriate envelope once, not once per hairstyle. Cloth simulation, strand simulation and arbitrary concave/animated fitting volumes are outside the current implementation.

## Verification and likeness review

From `avatar-studio`, run `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run build` and `npm run test:package`. The package smoke test installs a tarball outside the checkout, imports ESM and declarations, verifies embedded assets and assembles a weighted look with accessories in real WebGL. The parent `examples/models.ts` is a second consumer with three approved recipes and different builds.

The reference browser fixture writes [components](evidence/reference-v2/browser-components.png) and [weight comparison](evidence/reference-v2/browser-weight-study.png), with recipes and local assembly timings in adjacent JSON. It renders actual GLBs, both weight endpoints, front/profile/elevated views and fitted cap/glasses/mustache combinations. Generated artwork is never substituted into this proof.

Automated checks cover all 217,728 structural combinations, a heaviest-equipment sweep of every authored head/hair/hat/glasses state, actual triangle intersections, unseen wide/tall hair, source restoration and instance isolation. The maximum fitted look is 13,862 source triangles, below 14,000; silhouette ink is an additional rendering pass. Tests check actual body/garment deformation, overall height, fixed joint centers and symmetric expansion around limb axes. These checks do not claim every combination was visually reviewed or that measured desktop timings qualify a full room on phones.

The kit now carries the requested angular head, swept hair, sportswear silhouette and a functioning modular customization system. It remains an art prototype: the drawings have subtler hand posing, garment drape, facial asymmetry and line placement. Three expression atlases are implemented; facial blend shapes, finger animation and a production animation library are not. No numerical likeness percentage or perfect match is claimed. Compare the actual render to the supplied studies before approving another art pass.

The current collection extension and packed front/side/top workflow are documented in [Collection 02](collection-02-workflow.md). It adds three independent hair, jersey and face combinations, plus neck sizing.
