# Court collection references

Created September 26, 2026 with the built-in image generation tool, using
`docs/evidence/reference-v2/browser-components.png` (the actual avatar GLBs in
the browser) as the input reference. These are design references, not evidence
of the exported assets. No outside models or brand designs were used.

`courtside.png`: teal zip warm-up top, cream shoulder yoke and binding,
charcoal long training shorts with teal side panels, open sports visor.
`matchday.png`: burgundy V-neck kit, diagonal gold sash, cream shorts side
panels, gold hems, charcoal sports glasses with amber lenses.

Modeling preserves the existing athlete's proportions and connected shoulder
and crotch topology. The sash meets at the side seams; its diagonal therefore
reverses on the back view, correcting the inconsistent generated turnaround.
The cloth is flat-shaded geometry with material panels, not a painted image.
The longer shorts were widened after browser review exposed the thigh in
profile. The zip top's hem is part of the connected cloth, avoiding the arm
weighting artifact found in an initial separate ring.

## Prompt set

Both prompts requested equally scaled front, right-side and back orthographic
views, detail views, off-white background, clean flat cel lighting, crisp facets,
thin ink, no photorealism, no logos or microtexture, and exactly the input
avatar's angular head, swept hair, slender athletic limbs and relaxed A-pose.

Courtside design prompt: “a teal short-sleeve full-zip warm-up top with a small
standing collar, cream shoulder yoke, cream cuff binding, two narrow cream
vertical zipper tapes and short dark waist hem; charcoal knee-length loose
training shorts with cream vertical side piping and a small teal side panel;
teal open-top sports visor with cream brim edge, leaving the actual swept hair
visible. Existing black and white shoes.” Include isolated visor side/top and
torso detail; labels COURTSIDE, FRONT, SIDE, BACK, VISOR.

Matchday design prompt: “burgundy V-neck soccer jersey with a broad warm-gold
diagonal sash from the wearer's right shoulder to the wearer's left lower ribs,
gold sleeve cuffs and a fine cream V-neck binding; burgundy athletic shorts with
a cream outer side panel, gold hem binding and short side vent; slim charcoal
sports glasses with two rounded-rectangular smoky amber lenses, a straight
charcoal bridge and gold temple accent. Existing white crew socks and
black/white shoes unchanged.” Include isolated front/side glasses and jersey
detail; labels MATCHDAY, FRONT, SIDE, BACK, SPORTS GLASSES.

## Rebuild and verification

Run `assets/source/court_collection.py` in interactive Blender with `__file__`
set to that source path. It replaces only its named collection scene and six
exports. `court-collection.blend` retains editable geometry and armatures.
Run this builder after a full `reference_kit.py` rebuild to restore the additive
collection and catalog revision. Existing recipes from 2.2–2.5 remain accepted.

Run `tests/browser/court-study.spec.ts` for actual GLB turnarounds, body-size
endpoints and articulated cloth evidence in `docs/evidence/court-collection`.
The catalog deformation suite also includes the new garments automatically.
The glasses use the existing actual-face clearance/wrap fitter; the visor is
open to the same hair meshes, with natural occlusion. Neither needs a separate
hair version. New assets range from 230 to 482 source triangles each.
