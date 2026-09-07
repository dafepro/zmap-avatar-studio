# Illustrated character rendering

The avatar study uses designed shapes, painted shadow families and selective dark contours. Its face does not display a lighting boundary at every mesh triangle. The previous four-step toon gradient exaggerated those boundaries and made separately attached shoulders and fingers more obvious.

`ComicStyle` now uses a palette-preserving painted material. A broad shadow family blends into a broad light family with a quiet warm highlight. The head's skin shades from one ellipsoidal volume derived from its bounds, rather than from triangle normals; other surfaces use authored smooth normals. Face and effect assets retain authored color without a second lighting pass. glTF base-color maps, vertex colors, opacity and alpha masks are retained, so the design can move detail from geometry into drawn textures.

Thin inverted hulls supply silhouette ink. Hull normals are welded across duplicate positions and material/UV seams. Skin weights and indices are retained and the shell shares the live skeleton, so a connected shoulder deforms together with its contour. Transparent face paint and effects receive no hull. Ink is a second draw per opaque mesh; `inkWidth: 0` removes that cost. The shader does not draw wireframes, triangle edges, or artificial interior creases.

The slight pigment variation uses rest-pose object coordinates, with derivative filtering at small screen sizes. There is no time or screen-coordinate noise, animated crosshatching, or moving paper overlay. It is deliberately quiet: the asset's silhouette, face painting, and clothing folds must do most of the work.

```ts
const ink = new ComicStyle({
  inkWidth: 0.85,
  shadowStrength: 0.82,
  pigment: 0.35,
  inkColor: "#382c2b",
});
ink.update(avatar.object.children[0], renderer.getDrawingBufferSize(size));
// Return to the original materials before disposing a live scene.
ink.clear();
```

These controls belong to the consuming view and are not avatar recipe data. The illustrative key light stays fixed in world coordinates; adding arbitrary scene lights does not break the drawing's shared light direction. Materials bypass photographic tone mapping so the selected palette is not bleached by exposure.

The implementation extends Three.js r180's Basic shader using its normal, skinning, UV, alpha and color-space chunks. The optional ink shell uses the same skinning chunks. Consumers which clone materials for capture must also copy `onBeforeCompile` and `customProgramCacheKey`: Three's ordinary `Material.clone()` does not copy these callbacks.

## Evidence and limits

Unit tests cover source-map and palette retention, restoration, replacement disposal, no ink on transparent face paint, optional ink omission, and skeleton/weight sharing. A real WebGL test renders a bent skinned shape, checks that ink is visible, checks a repeat frame is identical, verifies deformation changes the image, checks shader errors, and measures visible brightness separation between the lit and shaded sides of a smooth surface. The studio test exercises twelve part swaps and presentation changes with bounded geometry resources.

Shader changes alone cannot turn cylindrical shoulders or tube fingers into anatomy, or supply missing illustrated expression. Connected meshes, natural silhouettes and authored face/clothing detail are separate acceptance requirements. The shader is intended to support those assets, not substitute for them.

A second visual pass found that the first painted ramp saturated too early, making most front-facing surfaces the same color. The ramp now spans the visible hemisphere and has stronger warm-light/cool-shadow separation. This retains broad volume on smooth cheeks, sleeves and hands without restoring polygon bands. The facial atlas was also enlarged vertically after comparison with the rebuilt lineup: almond openings are 32% taller and 6% wider, brows have stronger silhouettes, and nose ink reads at portrait size.

This view is not a general physically based renderer: it deliberately ignores scene lighting and cast shadows on the character, does not add cloth folds or anatomical details, and does not synthesize new expressions. Pigment is a restrained color variation, not a claim of hand-painted texture. The atlas capture freezes the selected pose; animation requires additional captured poses or the live mesh. All likeness claims still require visual review of the assembled character from its intended camera.
