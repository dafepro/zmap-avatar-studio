# Four-set mixing qualification

This review combines the Sunline Courier, Moonwake Festival, Kiln Workshop and Tideglass Explorer proposals without changing the reusable runtime. Each proposal remains independently selectable and independently reviewable. The common studio baseline is `353d8bcf7e1ecc25dc9b56cda3f1b120153480e3`.

## Actual runtime qualification

The manual script loads the exact GLBs through `AvatarLibrary`, including ordinary integrity, schema, shared-skin and fitted-geometry validation. It tests:

- Four complete set looks and a sixteen-pattern orthogonal array covering all sixteen value pairs for every pair of the five new slots
- Two heads and three body builds for every pattern
- Every new headwear piece with all nine original hairstyles and the heaviest new choice in each other set slot
- Full occupancy of facial hair, eyewear and effect slots as well as the five new set pieces
- Finite actual posed vertices, unchanged bone translations/scales, real shoe floor support, resource limits, and no triangles bridging the two lower legs at rest

The final run passed **336 assembled cases and 1,680 sampled poses**. Its maximum fitted source count is **13,727 triangles**, maximum selected source bytes **885,140**, and minimum shoe height is zero to floating-point precision. The unchanged caps remain 14,000 source triangles, 1.5 MB and 12 parts. Ink rendering adds its own pass.

[Summary and all twenty asset hashes](evidence/collectible-mixes/summary.json) · [Complete machine-readable result, gzip-compressed](evidence/collectible-mixes/qualification.json.gz)

The full report is compressed only for repository transport; the summary pins both its compressed and uncompressed SHA-256. It contains every case, selection and measured pose result.

## Reproduce

After all four proposals are present in one checkout:

```sh
npm ci
node --import tsx scripts/qualify-collectible-mixes.ts
```

For independent worktrees, run from a checkout containing this script:

```sh
node --import tsx scripts/qualify-collectible-mixes.ts \
  --sunline ../avatar-set-sunline \
  --moonwake ../avatar-set-moonwake \
  --kiln ../avatar-set-kiln \
  --tideglass ../avatar-set-tideglass \
  --out /tmp/collectible-mix-qualification.json
```

The script reads each set's manifest and descriptors from its selected root. It defaults to the current checkout for every root; it does not silently replace missing parts. This is a manual integration check rather than a requirement that an individual set PR carry the other sets' assets.

## Fit review and limits

The reviews caught and corrected ankle-mask gaps, unsupported pack mounting, loose or buried panel details, knee exposure, a crossed-leg source-import regression, an unnatural high crotch opening, and oversized upper-waist interfaces. Sunline and Moonwake preserve the legacy waist/upper-seat envelope while retaining their lower cargo and balloon silhouettes.

Waist contacts are interpreted in context. A tucked inner top and an overlapping waistband can intersect internally without an external defect. Tests and front/side/back/motion review distinguish those expected layers from visible waistband fragments piercing an untucked top. Actual skin visibility checks exclude hidden body regions, non-intersecting numerical rays and rays entering genuine open cuff boundaries; they retain positive sample/cuff guards.

This is sampled low-poly fit qualification, not a cloth simulator or an exhaustive proof against every triangle intersection at every animation time. The machine report measures integrity, fitting budgets, topology invariants and posed support; the per-set documents and committed Chromium screenshots provide the visual review. Blender geometry previews are explicitly separate from shipping `ComicStyle` browser captures. Phone/full-room performance and arbitrary-terrain support are not established here.
