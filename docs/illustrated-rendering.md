# Illustrated character rendering

The supplied reference studies use designed silhouettes, broad cel families and dark ink contours. `ComicStyle` preserves the palette, embedded maps, vertex colors and alpha while applying three cel bands with derivative antialiasing only at their boundaries. The head shades as one volume rather than exposing the triangle grid. Other surfaces keep their authored normals; expressions keep their drawn color.

The reference face has front and profile paint on actual fitted geometry. `expressionProjection` material metadata gradually exchanges these layers around 63–78 degrees from the front. Both lit and illustrated views apply this behavior. The shader does not invent a new eye or flatten the mesh; each profile is authored in the expression atlas. See the reference workflow for source details.

Inverted hulls supply silhouette ink. Hull normals are welded across duplicate positions and material/UV seams. Skin weights and indices are retained and the shell shares the live skeleton, so a connected shoulder deforms together with its contour. Transparent face paint and effects receive no hull. Ink is a second draw per opaque mesh; `inkWidth: 0` removes that cost. The shader does not draw wireframes, triangle edges, or artificial interior creases.

The slight pigment variation uses rest-pose object coordinates, with derivative filtering at small screen sizes. There is no time or screen-coordinate noise, animated crosshatching, or moving paper overlay. It is deliberately quiet: the asset's silhouette, face painting, and clothing folds must do most of the work.

```ts
const ink = new ComicStyle({
  inkWidth: 1.45,
  shadowStrength: 0.82,
  pigment: 0.35,
  inkColor: "#20252a",
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

This view is not a general physically based renderer: it deliberately ignores scene lighting and cast shadows on the character, does not add cloth folds or anatomical details, and does not synthesize new expressions. Pigment is a restrained color variation, not a claim of hand-painted texture. The atlas capture freezes the selected pose; animation requires additional captured poses or the live mesh. All likeness claims still require visual review of the assembled character from its intended camera.
