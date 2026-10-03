# Challenger: one original expressive human face

An independent `face-challenger` part for the SHIFT capsule. It adds an asymmetric cocked brow, a narrowed near eye and a confident off-center toothy grin. The front and two side views are independently authored alpha ink. It fits the existing Scout and Spark heads rather than adding another head or recoloring an existing expression.

## Concept and actual asset

- [Actual Chromium head views](evidence/challenger/browser-heads.png), [assembled browser run and wave](evidence/challenger/browser-action.png), [pixel report](evidence/challenger/browser-report.json) and [capture provenance](evidence/challenger/browser-verification.json)

- [Original generated concept sheet](references/challenger/concept.png), [exact prompt](references/challenger/prompt.txt) and [provenance](references/challenger/provenance.json)
- [Actual fitted head views](evidence/challenger/blender-heads.png): both heads, front, both three-quarter views and both strict profiles
- [Actual assembled run and wave](evidence/challenger/blender-action.png)
- [Controlled before/after profile-fit comparison](evidence/challenger/profile-lattice-comparison.png) and [pinned comparison metadata](evidence/challenger/profile-lattice-validation.json)
- [Original editable SVG ink](../assets/textures/face-challenger.svg) and [embedded-texture PNG source](../assets/textures/face-challenger.png)
- [Editable Blender source with packed artwork and concept](../assets/source/challenger/face-challenger.blend)

The concept is a design reference, not an asset screenshot. The displayed Blender evidence uses the positions, indices, UVs, palette and poses of the actual GLBs after `AvatarLibrary` loading and fitting. Its review cel material is not the shipping Three.js `ComicStyle` shader. The dedicated browser test passed in Chromium and renders that real shader. The committed `browser-heads.png`, `browser-action.png` and `browser-report.json` were retrieved from its verified CI artifact and visually inspected.

## Fit and budget

| Contract             | Value                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| Part / slot          | `face-challenger` / `face`                                                    |
| Rig / target surface | `athlete-reference-v2` / `face-v2`                                            |
| Attachment           | `face-challenger__head` → `head`                                              |
| Source triangles     | 608                                                                           |
| GLB bytes            | 70,040                                                                        |
| Artwork              | One embedded 1024 × 1024 RGBA PNG                                             |
| Palette channels     | None; authored ink retains its colors                                         |
| Fitting              | `surface`, `radial`, 1.5 mm offset, 85 mm maximum distance                    |
| Front / profiles     | Existing angle-blend material extras; independent left/right profile UV cells |

No runtime, shader, rig, palette, original capsule array or legacy catalog change is required. The isolated capsule builder discovers `public/capsule/parts/face-challenger.json`, checks its hash/bytes, tags it and makes it available to the studio's expression selector. The generated capsule catalog is intentionally not committed in this piece PR.

The asset is 180 triangles lighter and at least 14,720 bytes smaller than every legacy expression. Thus replacing a legacy face with Challenger cannot increase any existing source-triangle or source-byte stack. The unchanged per-appearance limits remain 14,000 triangles, 1.5 MB and 12 parts. The inspected hair/clothes/shoes motion examples use 11,466 triangles and seven parts.

## Authoring and corrections

1. Generated one original built-in imagegen concept with a cocked eyebrow, angular lids and side-grin. The exact input is retained unchanged, with no reference images, downloaded art or copied character mesh.
2. Drew new SVG paths for the front and distinct left/right profiles. Rasterized with Inkscape 1.4 to a transparent RGBA atlas. Empty atlas quadrants and alpha gutters stay genuinely transparent.
3. Authored the source with Blender 4.3.2 Python in the cloud VM and exported a self-contained GLB using the established exporter. Source and concept are packed into the editable `.blend`. This was background Blender authoring, not an interactive sculpting session.
4. Loaded the exported GLB through the actual runtime on both heads. Inspected front, oblique and strict-profile renders rather than accepting a successful export alone.
5. Corrected the evidence importer for glTF's top-origin texture convention. Then fixed a real profile-fit problem: a uniform-depth cheek grid bridged head bevels and clipped tooth paint. Challenger's cheek geometry now follows the head's exact angular section lattice. The tooth stroke is continuous at both profiles while the radial offset stays 1.5 mm; the improved grid also reduces geometry from 788 to 608 triangles.
6. Moved the profile grin down to align with the front mouth height. The two near-eye/brow profiles retain the expression's asymmetry.

## Reproduce

```sh
inkscape assets/textures/face-challenger.svg --export-type=png \
  --export-filename=assets/textures/face-challenger.png
blender -b --python assets/source/face_challenger.py
node scripts/build-capsule-catalog.mjs
node --import tsx scripts/challenger-runtime-snapshot.ts
blender -b -t 2 --python assets/source/challenger/render_runtime.py
python assets/source/challenger/compose_review.py
node --import tsx --test tests/challenger-face.test.ts
ZMAP_BROWSER_CHANNEL=chromium npx playwright test tests/browser/challenger-face.spec.ts
```

The runtime snapshot exporter writes reproducible intermediate mesh JSON under ignored `outputs/challenger/`; it does not ship a second avatar or geometry format. The runtime continues to consume only the GLB and pinned descriptor.

## Validation and limits

- The descriptor passes catalog validation, pinned SHA-256/bytes inspection, embedded-PNG validation and attachment checks
- Both actual head GLBs load at body weights −1, 0 and +1; the fitted face remains finite and head-socket-bound through idle, wave and run
- Both profile UV cells remain independent after runtime fitting
- Node tests verify the front/profile shader hook contract; actual browser tests compare rendered pixels with each layer suppressed in lit and illustrated modes at 0°, ±45°, ±70° and ±90° on both heads
- PNG pixel auditing checks opaque artwork, antialiased edges and clear gutters; see [texture audit](evidence/challenger/texture-validation.json)
- All 169 unit tests, typecheck, formatting and production build passed locally after the final visual refinement

Direct local Chromium and CUA loopback access are blocked in this cloud environment. No browser security restriction was bypassed. The browser spec runs under the repository's existing GitHub Actions Verify job and a focused Challenger job. The small `challenger-browser-evidence` artifact contains this piece's browser PNG/JSON evidence without the full historical image collection. Browser pixel verification passed at commit `822f5354`, with 56 actual lit/illustrated layer checks across both heads. The downloaded front/profile and action sheets were visually inspected; the final aggregate CI status is on the PR. This is an authored fixed expression with angle-aware artwork, not facial blend-shape animation or a promise of identical appearance under every hair/accessory combination.
