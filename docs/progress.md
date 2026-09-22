# Progress

| Stage | Module | Status |
|---|---|---|
| 0 | Foundation | Done — JS verified; not yet launched on a device |
| 1 | Projects | Next |
| 2 | Survey | — |
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
- Lives in `heat-mapper/` inside the IRON repo for now, fully self-contained (own package, lockfile, lint, CI in `.github/workflows/heat-mapper.yml`); IRON's lint and branding audit skip this folder. It can move to its own repo without changes.
- Kept IRON's stack versions (Expo 52, RN 0.76, op-sqlite 11) instead of upgrading.
- Metric values stored as rows with explicit units, so new metrics need no migration.
- Freshness defaults: 2 s maximum age on receipt, 0.5 s clock skew. Revisit with probe cadence in Stage 5.
- Location kinds are fixed to building/floor/room.
- Bundle id `app.heatmapperlive` is a placeholder until store registration (Stage 6).
- Expo CLI logs "Using src/app as the root directory for Expo Router" because of the folder name. It is harmless while expo-router isn't installed. Use React Navigation (Stage 1), not expo-router.

## Next: Stage 1 — Projects
Implement the `SurveyRepository` project/location methods on SQLite, an ID generator (injected), and React Navigation with a project list, project detail with a Building → Floor → Room tree and breadcrumbs, create/edit/delete, offline autosave and a survey-history list. Gate: saved projects survive restart.
