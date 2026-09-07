/**
 * Node contract tests exercise GLTF ownership/binding, not raster decoding.
 * Provide an ImageBitmap-shaped metadata value after the loader reads its PNG.
 * Browser integration tests use the real decoder and verify rendered artwork.
 */
if (typeof window === "undefined") {
  Object.defineProperty(globalThis, "self", {
    configurable: true,
    value: globalThis,
  });
  globalThis.createImageBitmap = (async (input: Blob) => {
    const data = new DataView(await input.arrayBuffer());
    if (data.byteLength < 24 || data.getUint32(0) !== 0x89504e47)
      throw new Error("Expected embedded PNG in contract test");
    return {
      width: data.getUint32(16),
      height: data.getUint32(20),
      close() {},
    } as ImageBitmap;
  }) as typeof createImageBitmap;
}
