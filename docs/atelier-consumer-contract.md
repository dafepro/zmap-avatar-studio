# Atelier consumer boundary

Source review: 2026-10-03. Atelier is a standalone `/atelier.html` lab route. It
uses the existing runtime and an explicitly separate capsule catalog; it does
not change the consumer's saved-avatar or multiplayer contracts.

## Verified versions

- Avatar Studio remote `main` and prototype baseline:
  [`4798863633d67bf92531c39fa22559fceab6fb6d`](https://github.com/dafepro/zmap-avatar-studio/commit/4798863633d67bf92531c39fa22559fceab6fb6d),
  package `0.1.2`, legacy catalog `zoomap-athletics` revision `2.5.0`, rig
  `athlete-reference-v2`.
- Consumer remote `main`:
  [`c4c569ef4b0870559d61c23db4b2cbdf41232b07`](https://github.com/dafepro/fc-workout-pwa/commit/c4c569ef4b0870559d61c23db4b2cbdf41232b07).
  Its [package.json](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/package.json)
  and [pnpm lock](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/pnpm-lock.yaml)
  pin the GitHub release tarball `zmap-avatar-studio-0.1.2.tgz`, with Three.js
  `0.180.0`.
- Consumer-pinned [release `v0.1.2`](https://github.com/dafepro/zmap-avatar-studio/releases/tag/v0.1.2)
  points to `80309e1ebb8a0ff7ac3eae83de1a573f18216a59`. GitHub reports tarball
  SHA-256 `0d98c475de909f571d9806c87cbe8ca9351d9c4149e64d5cffb2b5ead89915f9`.
  Its legacy catalog is also `2.5.0` with 39 assets. The release tag and current
  main are different commits; a matching package version is not byte identity.
- Latest published [release `v0.1.4`](https://github.com/dafepro/zmap-avatar-studio/releases/tag/v0.1.4)
  points to `a5324883c1c6b3b150983085fef75daf0c9119ed`, published 2026-09-26.
  It has catalog `2.7.0` with 48 assets. Current main is not that release.
  This prototype does not silently switch baselines or upgrade the consumer.

Tag SHAs were checked with GitHub's ref API and `git ls-remote`; release metadata
was checked with the releases API. The tarball digest above is GitHub-reported,
not a newly downloaded artifact verification. Some consumer documentation still
mentions older package versions; the manifests and lockfile are authoritative.

## Exact existing integration

[Character adapter](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/app/team-world/adapters/characters.ts)
imports these names from the package root:

- `AvatarLibrary`, `validateCatalog`, `defaultRecipe`, `AvatarInstance`, `Motion`
- `WieldLibrary`, `WieldController`, `validateWieldCatalog`, `emptyWieldLoadout`
- `ComicStyle`, `fieldToolBehaviors`, `disposeAvatarResources`, `isEmoteId`

The [cannon adapter](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/app/team-world/adapters/cannon.ts)
also imports `ComicStyle`. Preserve the root ESM/types exports, data-only
`/core` and `/wield-core`, and `./assets/*` mapping. App UI belongs outside
`src`; the library build includes only `src`, not `app`.

The [asset preparation script](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/scripts/prepare-team-world.mjs)
resolves `@zmap/avatar-studio/assets/catalog.json`, then copies only
`catalog.json`, `models`, `action` and `wield` into
`public/team-world-assets/v0.1.1/`. The `v0.1.1` directory name persists despite
the `v0.1.2` dependency. Do not rename it as part of this lab.

`loadActionKit` fetches appearance `catalog.json` from that root and equipment
`action/catalog.json` from a separate `action/` base. It validates both, prepares
three synchronous appearance factories, and preloads the field kit. Required
legacy recipe choices are:

| Identity key | Hair         | Skin      | Primary   | Body weight |
| ------------ | ------------ | --------- | --------- | ----------- |
| `burgundy`   | `hair-sweep` | `#c68b60` | `#ece8dd` | `0`         |
| `saffron`    | `hair-halo`  | `#855538` | `#d4a149` | `0.55`      |
| `sage`       | `hair-pony`  | `#edc39d` | `#547780` | `-0.35`     |

All use `defaultRecipe(catalog)`, secondary `#29383d`, and hair `#302922` except
sage (`#ac793e`). Keep default required-slot ordering and all referenced IDs.
Equipment is selected by accepted simulation state, using `wield-${tool}` as a
two-handed item with right primary ownership. The adapter calls `setLoadout`,
`setDrawn`, `getHand`, `isDrawn`, `diagnostics`, avatar `update` and
`animationDiagnostics`, and explicit disposal. Preserve these lifecycles.

Its ink bindings refresh when equipment roots or viewport size change. The
adapter assumes appearance topology is fixed after creation. A later in-place
wardrobe integration must invalidate/reapply `ComicStyle` bindings after an
appearance swap; exporting a recipe alone does not add that behavior.

## Appearance and authority are not interchangeable

The [Go authority](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/backend/internal/httpapi/team_world.go)
selects `burgundy`, `saffron` or `sage` by a stable player-ID hash. The
[relay](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/services/team-world/authority.mjs)
accepts only those three keys. The browser adapter rejects other identities.
There is no user-recipe transport or saved modular appearance endpoint in this
Team World slice.

The separate [profile avatar config](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/app/avatar/config.ts)
is a version `"5"` flat string map for illustrated layers and palette strings.
Its [gateway](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/app/data/avatar-gateway.ts)
PUTs `{ configuration: ... }` to `/api/zoomigo/v1/me/avatar`. Its
[backend validator](https://github.com/dafepro/fc-workout-pwa/blob/c4c569ef4b0870559d61c23db4b2cbdf41232b07/backend/internal/domain/avatar.go)
permits at most 14 string entries and 512 serialized bytes. It cannot store a
nested `Recipe` or equipment envelope. Do not overwrite, dual-write or convert
this state implicitly. Identity, entitlement approval, inventory and world
consequences remain consumer-owned.

## Isolated capsule loading

The lab's agreed layout is a complete `public/capsule/catalog.json` with
`public/capsule/models/` containing unchanged copies of the required legacy
models alongside new meshes. Load it with base URL `/capsule/`.

- Give this composed catalog its own identity and explicit revision. Preserve
  the existing rig and schemas; preserve legacy `public/catalog.json`, model
  bytes, IDs, exports and default entry points.
- Both appearance and wield validators require manifest asset URLs matching
  `models/<safe-name>.glb`. Keep this relative form. Do not rewrite URLs to
  `capsule/models/...` or relax the validator. The separate base supplies the
  namespace. Retain exact byte counts, SHA-256 and triangle metadata.
- Run `validateCatalog` on the complete composed manifest. Recipes must match
  that catalog identity, rig and exact revision or an explicitly approved older
  recipe revision. Sharing a rig or package version grants no compatibility.
- Capsule recipes deliberately fail validation against the legacy catalog.
  Export labels must identify their capsule dependency rather than promise a
  drop-in Team World import. Any future migration requires explicit mapping and
  qualification, never revision rewriting or silent asset substitution.
- The browser lab can serve `public/capsule` through Vite. The current npm
  `files` allowlist omits it, and the consumer copy script omits it independently.
  Shipping capsule to another app later requires an explicit packaging change
  plus consumer copy/load changes. Merely adding the directory or a Vite entry
  does not distribute it in the existing tarball integration.
- Use new browser-storage keys for Atelier. Legacy Studio currently owns
  `avatar-studio:current` and `avatar-studio:looks`.

## Full-look presets

A lab-owned, versioned preset envelope may contain a validated `Recipe` and a
validated `WieldLoadout`. It is a new app format, not a new runtime `Recipe`.
Validate the envelope separately, resolve only trusted catalog identities, then
validate each contained value against its corresponding manifest. The wield
catalog has its own identity/revision and must target the same rig.

Keep appearance-only export available as the existing recipe format. Full-look
export must be explicitly identified as an Atelier preset. Do not add equipment,
URLs, account IDs, authorizations or UI settings to `Recipe`; unknown fields
are rejected. A two-handed loadout requires `left: null`, `right: null` and its
approved `twoHanded` item/primary pair. One controller owns an avatar's hand pose.

Appearance and equipment loading are each transactional independently. Their two
promises do not provide a combined transaction. Validate the entire envelope
before changing the UI, retain the last committed state on failed loads, and
make any cross-part staging/rollback semantics explicit. Await appearance before
initially attaching the equipment controller; dispose instances/controllers
before shared libraries. Pose, camera, ink style and thumbnail state are
presentation state, not multiplayer authority.

## Verification performed and release gate

This review changed only this document. A focused check against the baseline
runtime passed all three exact consumer preset recipes. Negative checks proved
that a nested capsule asset URL is rejected (`asset`), a full-look wrapper is
not a `Recipe` (`schema`), and a distinct capsule identity is rejected by the
legacy catalog (`version`). This is source/contract verification, not a live
consumer or browser qualification.

Before a future release: verify legacy asset hashes unchanged, run unit/types/
build and independent package smoke checks, exercise existing Studio/Wield/Action
routes, then test capsule imports, failed loads, repeated swaps and resource
cleanup in real WebGL. A later consumer rollout additionally needs a versioned
persistence/entitlement design, copied capsule assets, adapter style invalidation
and consumer integration tests. No package bump, consumer upgrade, push or
deployment is implied by this standalone prototype.
