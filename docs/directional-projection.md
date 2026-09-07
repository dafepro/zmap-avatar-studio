# Sixteen-view avatar projection

The studio can capture the equipped avatar as sixteen transparent orthographic drawings, one every 22.5 degrees. The capture combines the current head, hair, painted face, clothes, accessories, palette, pose and shading into a single image for each direction. It is a presentation cache; identity, inventory, movement and permissions stay with the consuming application.

The study sheet is strongest in its connected silhouettes, expressive painted faces and deliberately placed shading. A projection preserves those choices as a stable, unlit image once the 3D construction and illustrated material achieve them. It cannot turn disconnected geometry into an artist's drawing by itself. The live sculpting and face-paint work remain the source of the visual result.

## Public capture and preview

```ts
import { bakeDirectionalAtlas } from "@zmap/avatar-studio";

const abort = new AbortController();
const atlas = await bakeDirectionalAtlas(renderer, avatar.object, {
  tileSize: 256,
  elevation: Math.PI / 24,
  signal: abort.signal,
  onProgress: (complete, total) => updateProgress(complete / total),
});

const preview = atlas.createPreview();
scene.add(preview.object);
preview.setAzimuth(Math.PI / 4); // camera sees the front-right side
preview.faceCamera(camera);

// Release a view independently, or dispose the complete atlas and all its views.
preview.dispose();
atlas.dispose();
```

Pass the stage's lights through `lights` to retain its light setup. Omitting them uses a soft studio rig. Applied `ComicStyle` materials and their custom shader callbacks are copied into the capture; outlines use the tile's pixel resolution. Each material preserves its live `toneMapped` setting: ordinary materials use the renderer's selected mapper and exposure, while illustrated materials bypass them. The material's output is converted to sRGB before blending, matching the live canvas; atlas resolution only downsamples and copies those pixels. `RawShaderMaterial` retains its explicitly authored output path, as it does in Three.js. Each view is rendered at twice its final dimensions and downsampled before atlas storage, smoothing diagonal ink contours without increasing the final texture size. Capturing requires an sRGB renderer output. A custom renderer tone-mapping implementation requires an explicit capture integration and is rejected by this API.

`createPreview()` creates one plane, one material and one draw call. All previews of an atlas share its single texture, while each selects its own frame. The plane is unlit: lighting and drawn shading are already in the image. For a world with avatar heading `heading` and camera azimuth `cameraAzimuth`, select `cameraAzimuth - heading`. `stableDirectionIndex()` adds a small hysteresis around view boundaries when a continuously moving camera would otherwise flicker between neighboring directions. Its default margin is two degrees.

The exported `metadata` describes all sixteen frames, their azimuths, the fixed elevation, framing center, world size and color space. Frame zero looks along the avatar's +Z front; increasing angles move toward +X. Image rectangles use a top-left origin, matching PNG/canvas coordinates. UV bounds use a bottom-left origin and a half-pixel inset to prevent adjacent tiles from bleeding into one another. Metadata is frozen after validation.

## PNG and JSON export

`atlas.readPixels()` returns a detached copy of the complete RGBA8 buffer, ordered bottom row first. It requires no renderer or DOM. Browser tooling can flip its rows into `ImageData` before exporting:

```ts
const { width, height } = atlas.metadata;
const source = atlas.readPixels();
const topDown = new Uint8ClampedArray(source.length);
const stride = width * 4;
for (let y = 0; y < height; y++) {
  topDown.set(
    source.subarray(y * stride, (y + 1) * stride),
    (height - 1 - y) * stride,
  );
}
const canvas = document.createElement("canvas");
canvas.width = width;
canvas.height = height;
canvas
  .getContext("2d")!
  .putImageData(new ImageData(topDown, width, height), 0, 0);
canvas.toBlob(savePng, "image/png");
saveJson(JSON.stringify(atlas.metadata, null, 2));
```

Cache an atlas by the complete validated recipe, asset revision, capture pose, illustrated-style revision, tile size and elevation. Parts and colors are assembled before capture, so individual applications can retain modular editing without carrying a separate sprite sheet for every catalog part. A newly equipped part invalidates the prior capture. Do not silently show an old look as a newly accepted appearance.

## Resource and transaction contract

The library default 256-pixel tile makes a 1024×1024 atlas: 4 MiB of GPU RGBA texture and 4 MiB of CPU export pixels. There are no mipmaps, no texture per direction and no automatic background rebaking. A capture may use 64–512 pixels per tile; the 512 maximum gives 16 MiB each for the GPU texture and CPU pixels. The design studio uses 512-pixel tiles (2048² atlas, 16 MiB each GPU/CPU) to keep an enlarged portrait crisp. The runtime default remains 256 for world-scale consumers. Calling `readPixels()` creates one additional CPU copy for the caller to release.

While baking, temporary resources include one RGBA atlas render target, one half-float tile target with depth at twice the output tile resolution, an output quad and a snapshot of the avatar. The source snapshot is bounded to 256 meshes, 32 MiB of geometry buffers and four million texture pixels. Lights are bounded to eight. The source asset catalog normally imposes much lower limits before assembly. These are maximum allocation guards, not a claim that the highest allowed capture is appropriate on a phone.

The baker needs WebGL2 with `EXT_color_buffer_float`, an active graphics context and enough texture size for the atlas. It rejects missing/unfinished textures, video textures, empty avatars, invisible results, invalid bounds and unsupported sizes. It never publishes a partial result.

Only one capture may run on a given renderer. Between each view it yields to the browser so the studio remains responsive. Each frame saves and restores the render target, viewport, scissors, clear settings, XR state and shadow-update setting. Pixel ratio is never changed. A render failure, abort signal or lost graphics context releases temporary resources and permits a later retry. The current successful atlas remains the application's responsibility until its replacement has completed.

Transforms, skeletons, geometry, materials and texture GPU objects belong to the capture snapshot. It never advances the original avatar's pose or mutates its live transforms. Shader callbacks must be pure with respect to their source avatar; the supplied illustrated material follows this contract. Every captured map is synchronously uploaded with `renderer.initTexture()` before the first browser yield, including maps on pieces facing away from the initial view. Texture clones have independent `Source` objects and version counters. The original avatar and its source `ImageBitmap` can therefore be disposed between later views without invalidating the snapshot's GPU pixels or causing a re-upload from a closed bitmap. A lost graphics context aborts the complete capture. Hidden child pieces stay hidden.

## Deliberate limits

This is a frozen pose at one elevation. It does not provide walking, hand gestures or arbitrary camera pitch. Turning selects one of sixteen views and may visibly step at 22.5-degree boundaries. A front-view studio close-up and a more elevated lounge camera need captures with different pitches. A plane can intersect scenery or sort differently from a full 3D body; a consuming world must choose its placement, occlusion and shadow policy explicitly.

A production animated projection would need bounded pose frames and carefully chosen transitions. For example, eight walk frames would multiply atlas storage by eight before considering other gestures or outfits. The current feature therefore supports visual comparison, portrait/directional export and testing a fixed-camera integration. The studio retains live 3D animation for interactive movement. No physical-phone performance qualification or animated sprite system is implied.

Tests cover direction wrap, UV layout, framing, independent previews, disposal, skinned-pose isolation, custom shader retention, size/readiness rejection, cancellation and renderer-state restoration. Browser tests additionally inspect visible pixels and draw-call/resource behavior in a real WebGL context. GPU color patches compare live and baked output under ACES for both `toneMapped: true` and `false`, within two values per RGBA8 channel. Another GPU check closes the original bitmap after the first view and verifies its colors across all sixteen completed directions.
