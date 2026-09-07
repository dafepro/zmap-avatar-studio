import type * as THREE from "three";

/** A pair of authored paint projections shares one expression atlas. This
 * material treatment also works without ComicStyle, in a lit consumer scene. */
export function applyExpressionProjection(material: THREE.Material) {
  const projection = material.userData.expressionProjection;
  if (projection !== "front" && projection !== "profile") return;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  const baseKey = key();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vExpressionProfile;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 expressionView = normalize(vec3(modelViewMatrix[0][2], modelViewMatrix[1][2], modelViewMatrix[2][2]));
        vExpressionProfile = 1.0 - smoothstep(0.20, 0.45, abs(expressionView.z));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vExpressionProfile;",
      )
      .replace(
        "#include <alphatest_fragment>",
        `diffuseColor.a *= ${projection === "profile" ? "vExpressionProfile" : "(1.0 - vExpressionProfile)"};
        if (diffuseColor.a < 0.01) discard;
        #include <alphatest_fragment>`,
      );
  };
  material.customProgramCacheKey = () =>
    `${baseKey}-expression-v1-${projection}`;
}
