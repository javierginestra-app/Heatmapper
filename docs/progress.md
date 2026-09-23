# Progress

| Stage | Module | Status |
|---|---|---|
| 0 | Foundation | Done — JS verified; not yet launched on a device |
| 1 | Projects | Done — JS verified; not yet exercised on a device |
| 2 | Survey | Next |
| 3A | Mapping: geometry | — |
| 3B | Mapping: heat maps | — |
| 4 | Reports | — |
| 5 | Optional probe | — |
| 6 | Billing/release | — |

## Stage 0 — Foundation
- Built: core models, contracts, validation, series keys and RSSI policy; storage (op-sqlite driver, migration runner, schema v1, settings store); capability detection; lint rule for import boundaries; launch screen showing schema version and every capability with a reason.
- Verified: `npm run verify` (typecheck, lint, 63 tests) and `npm run bundle:check` (Metro builds iOS and Android bundles).
- Not verified: native build and launch on a device or simulator (no Xcode or Android SDK in the build environment). First hardware check: run `npx expo run:android` and `run:ios`, confirm the app shows "schema v1" and iOS lists native RSSI as Unsupported.
- Migrations: v1 `initial`.

## Decisions
- Started inside the IRON repo by mistake and moved here with its history (Stage 0–1 commits). Shares nothing with IRON. CI: `.github/workflows/ci.yml`.
- Stack pinned to Expo 52, RN 0.76, op-sqlite 11.
- Metric values stored as rows with explicit units, so new metrics need no migration.
- Freshness defaults: 2 s maximum age on receipt, 0.5 s clock skew. Revisit with probe cadence in Stage 5.
- Location kinds are fixed to building/floor/room.
- Bundle id `app.heatmapperlive` is a placeholder until store registration (Stage 6).
- Expo CLI logs "Using src/app as the root directory for Expo Router" because of the folder name. It is harmless while expo-router isn't installed. Use React Navigation (Stage 1), not expo-router.

## Stage 1 — Projects
- Built: `ProjectRepository` on SQLite; project/location rules and tree helpers in core; projects module with list, project and location screens, Building → Floor → Room nesting (levels may be skipped, never inverted), tappable breadcrumbs, autosave (offline, debounced, flushed on leave/background), "Use current location" (expo-location, foreground only), per-project RSSI target, cascade-aware delete confirmations, survey history (scoped to a location and its descendants); capability screen moved behind the "Device" header button.
- Contract change: `SurveyRepository` split. Project/location methods and `listSessionHistory` moved to the new `ProjectRepository`; `SurveyRepository` keeps sessions, series, gaps and samples (Stage 2).
- Verified: `npm run verify` (88 tests, including the restart gate: a file database closed and reopened keeps projects and the tree) and `npm run bundle:check`.
- Not verified on a device: navigation, keyboard handling, autosave timing, location permission prompt. Hardware check: create a project with nested locations, force-quit, relaunch and confirm everything is there; deny then allow location permission.
- Migrations: none (schema v1 already had the tables).
- Dependencies added: @react-navigation/native + native-stack, react-native-screens, react-native-safe-area-context, expo-crypto, expo-location (config plugin adds the when-in-use permission text).

## Next: Stage 2 — Survey
Implement `SurveyRepository` (sessions, series, gaps, `appendSamples` via `validateSampleBatch`, metric rows with units), the Android native RSSI adapter (Kotlin Expo module, connected-AP `WifiInfo.getRssi` at ≈1 Hz, fresh readings only), the owned-endpoint performance adapter (Wi-Fi required, byte cap, local vs internet), record/pause/resume with source and freshness display, manual map pins for positions, and capability probes registered in `container.ts`. Survey entry point goes on the Location screen.
