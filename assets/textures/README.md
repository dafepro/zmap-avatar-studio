# Drawn facial expressions

`face-ink.svg` is the editable, manually authored vector source for the original Zoomap facial artwork. Its shape language follows `docs/design-reference-v1.png` and the image-generated `face-study-paint-v1.png` reference: angled almond eyes, tapered expressive brows, warm illustrated irises, restrained nose marks and asymmetric smiles. The SVG is not an opaque crop of either reference.

`face-ink.png` is its 1024×1024 transparent raster export. Each atlas cell is 512×512:

| Cell         | Expression | Occupied feature positions in local pixels                       |
| ------------ | ---------- | ---------------------------------------------------------------- |
| Top left     | Focus      | Brows near y110, eyes near y190, nose near y300, mouth near y416 |
| Top right    | Grin       | Same brow/eye/nose placement; open smile extends to y479         |
| Bottom left  | Wink       | Same placement; the avatar's left eye is closed                  |
| Bottom right | Empty      | Every pixel has zero alpha                                       |

The refined eyes extend approximately from x68–224 and x288–444. There is no skin field, hair, head contour, or background in the image. Nose and mouth marks use warm brown ink; iris color is authored brown in this atlas. Palette-controlled iris masks can be added separately in a later artwork format.

Regenerate from the independent studio directory:

```sh
node scripts/render-face-texture.mjs
```

The script uses an isolated headless Chrome instance to rasterize SVG onto a clear canvas. It verifies opaque artwork, partially transparent antialias pixels, mostly empty alpha around each expression, and an entirely empty fourth cell before writing the PNG. The 1024px export is approximately 118 KB. No server or network fetch is used.

The image-generated `face-study-paint-v1.png` is reference material only: its checkerboard is baked into RGB, so it must not be used as a transparent runtime decal. The SVG-derived PNG has verified true alpha and is the runtime source.

The second likeness pass enlarges almond openings by 32% vertically and 6% horizontally around their existing anchors, raises the strengthened brows by nine pixels to preserve lid clearance, and enlarges the nose mark by 24%. Re-exporting the Blender kit is required after changing this PNG because face GLBs embed it.

## Garment wash

`garment-wash.svg` contains original editable fold washes and broken stitch marks, with transparent space around the artwork. It has no crest, collar, neck shape, buttons or zipper. Broad shadow shapes sit below the underarms and above the waist; the central chest stays clear for the existing crest.

`garment-wash.png` is the 256×256 white-backed runtime map (8,099 bytes). Multiply it by the selected garment color. White texels preserve that color; pale warm greys supply drawn fold variation. Its coordinate contract is x −0.235 to +0.235 metres and y 0.86 to 1.36 metres, with the image top at y1.36. A consumer can map other surfaces to a white texel. `garment-wash-alpha.png` preserves the genuine-alpha drawn layers for other compositing workflows.

Regenerate using `node scripts/render-garment-texture.mjs`. The SVG and transparent-layer PNG remain 512×512. The exporter verifies the runtime PNG is 256×256 RGBA, that the source is mostly transparent, the runtime image has opaque white backing, the chest remains pure white, the darkest shading stays bounded, and the runtime file stays under 40 KB. Its final compression changes only the lossless PNG stream, preserving identical pixels. New exports must be embedded again when rebuilding garment GLBs.

The final profile-alignment pass shifts all three mouth groups down 36 pixels (anchor y380 → y416), aligning the painted mouth with the corrected lip shelf. Eyes, noses and brows are unchanged. The grin and lower mouth stroke remain inside their 512px atlas cells.
