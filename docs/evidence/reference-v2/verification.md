# Verification for the reference kit

Verified locally on 2026-09-07 with Node, Chrome and Blender 5.2.1 LTS.

- Avatar unit suite: **42 passed**, including fixed joint centers, limb-axis volume, source restoration, all 31,104 structural combinations and real accessory intersection checks.
- Avatar browser suite: **22 passed**, including real GPU skinning/ink, front/profile expression layers in both material modes, weight controls, component inspection, loading failure atomicity, persistent looks, 40 appearance replacements and 16-direction capture.
- Parent ZMap unit suite: **27 passed**.
- Parent ZMap browser suite: **7 passed**. Three real browsers exercised traffic shaping, host loss and a dropped durable acknowledgment. Twenty enter/dispose cycles held geometry and texture counts stable.
- Independent packed avatar consumer: ESM, declarations, GLB contracts, production build, texture decoding, weighted look with accessories, real rendering and directional capture passed.
- Avatar and parent TypeScript checks and production builds passed. Vite reports the existing large Three.js bundle warning; full-room phone performance is not established by these desktop checks.
- Heaviest fitted authored combination: **13,862 source triangles**, limit 14,000. Outlines are additional draws and geometry.

`browser-components.png` and `browser-weight-study.png` are direct browser renders. Adjacent JSON records their exact recipes and local assembly timings, which are observations rather than a device-independent performance guarantee. `blender-final.png` is the final rest-shape source render. `blender-iteration-*.png` and `browser-before-limb-fix.png` retain intermediate defects for workflow review.

The generated target is `../../references/weight-study.png`; it is separate from runtime evidence. The visual comparison verifies that the corrected weight endpoints retain the arm alignment while changing tissue thickness. The current art still differs from the source drawings in hand posing, cloth drape, asymmetry and detailed line placement.
