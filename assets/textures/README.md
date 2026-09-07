# Drawn facial expressions

`face-ink.svg` is original editable vector ink based on the user-supplied `docs/references/body.png`: dark almond eyes, angular brows, restrained nose and smile, plus grin and wink variants. It is not a crop of a concept image. `face-ink.png` is the 1024×1024 RGBA runtime atlas.

The top-left, top-right and bottom-left 512px cells contain the three frontal expressions. The bottom-right cell contains three 170×512 profile strips, with clear alpha gutters. Profile eyes and mouths are separately drawn to preserve expression at a strict side angle. There is no opaque skin/background layer. Iris color is authored in this atlas; the generic iris palette channel does not recolor this ink.

Run `node scripts/render-face-texture.mjs` in the studio directory. It uses an isolated local Chrome process, checks opaque ink, antialiased edges and mostly transparent background, then writes PNG. Rebuild the Blender kit afterward to embed the new bytes. Face GLBs use two projection materials sharing one image and sampler; the exporter canonicalizes Blender's duplicate sampler records.

The older generated `face-study-paint-v1.png` is historical reference only. The current art and runtime bytes come from the SVG and supplied component sheets.

## Garment wash

`garment-wash.svg` contains original editable fold washes and broken stitch marks, with transparent space around the artwork. It has no crest, collar, neck shape, buttons or zipper. Broad shadow shapes sit below the underarms and above the waist; the central chest stays clear for the existing crest.

`garment-wash.png` is the 256×256 white-backed runtime map (8,099 bytes). Multiply it by the selected garment color. White texels preserve that color; pale warm greys supply drawn fold variation. Its coordinate contract is x −0.218 to +0.218 metres and y 0.99 to 1.55 metres in the reference jersey. A consumer can map other surfaces to a white texel. `garment-wash-alpha.png` preserves the genuine-alpha drawn layers for other compositing workflows.

Regenerate using `node scripts/render-garment-texture.mjs`. The SVG and transparent-layer PNG remain 512×512. The exporter verifies the runtime PNG is 256×256 RGBA, that the source is mostly transparent, the runtime image has opaque white backing, the chest remains pure white, the darkest shading stays bounded, and the runtime file stays under 40 KB. Its final compression changes only the lossless PNG stream, preserving identical pixels. New exports must be embedded again when rebuilding garment GLBs.
