# Modules and contracts

## Core contracts (`src/core/contracts/`)
| Contract | Purpose | Implemented by |
|---|---|---|
| `MeasurementProvider` `{ id, capabilities(), start(config), stop(), subscribe(listener) }` | Emits untrusted `Reading`s plus `state` and `gap` events. A performance provider's `start` runs one test and resolves when it ends | `androidWifi` (Android RSSI), `performance` (owned endpoint), Stage 5 (probe) |
| `TrackingProvider` `{ id, capabilities(), start(config), stop() → mapId, subscribe() }` | Poses in the survey world frame, tracking quality and limit reason | Stage 3A |
| `ProjectRepository` | Projects, Building → Floor → Room tree (upserts, `ValidationError`, cascading deletes), `listSessionHistory` (location + descendants, newest first, sample counts) | storage `createProjectRepository` (Stage 1) |
| `SurveyRepository` | Sessions, series, gaps (upserts; `getSession`, `listSeries`, `listGaps`); append-only validated samples (`appendSamples` also rejects `context_mismatch`: session not recording, series missing/foreign/different key); `listSamples` oldest first; `interruptOpenSessions` for crash recovery | storage `createSurveyRepository` (Stage 2) |
| `ReportExporter` `{ exportPdf(request) }` | PDF from an immutable snapshot | Stage 4 |
| `BillingService` `{ getEntitlement, purchase, restore, subscribe }` | Store subscriptions | Stage 6 |
| `SettingsStore` `{ get, update }` | App settings (`externalProbeEnabled`, test endpoints, byte cap) | storage |

Providers emit `Reading`s (radio or test result only). The survey module attaches `SampleContext` (ids, pose/pin, tracking quality) to make a `Sample`. New sensors add a provider and register it in `src/app/container.ts`. Mapping and reports consume `Sample` and never change for a new sensor.

## Core policies and models
- `samples.ts`: `Reading`/`Sample` unions. `measurement.ts`: metrics and units, sources, bands. `project.ts`: Project, Location (building/floor/room), Session, Series, Gap.
- `validation.ts`: `validateReading`, `validateSample`, `validateSampleBatch` (RSSI integer -120..-1, BSSID format, freshness ≤ 2 s, ≤ 0.5 s clock skew, duplicate ids).
- `projectRules.ts`: `validateProject`, `validateLocation`, `allowedChildKinds` (kinds only deepen; levels may be skipped, e.g. a room directly in a project), `ValidationError`, `LIMITS`. `locationTree.ts`: `childrenOf`, `breadcrumbPath`, `descendantsOf`, `nextSortOrder`.
- `wifi.ts`: `bandChannelFromFrequency`, `normalizeSsid`, `normalizeBssid` (Android placeholders become null).
- `series.ts`: `seriesKeyOf`. `policies/rssiPolicy.ts`: bands, colours, target. `registry.ts`: `Registry<T>` (duplicate ids rejected).

## Feature modules (`src/modules/`)
| Module | Public API | Depends on |
|---|---|---|
| `storage` | `openDeviceDatabase`, `runMigrations`, `MIGRATIONS`, `createSettingsStore`, `createProjectRepository`, `createSurveyRepository`, `SqlDriver` | core, op-sqlite |
| `projects` | `ProjectListScreen`, `ProjectScreen`, `LocationScreen`, `ProjectsServicesProvider` (`{ projects, newId, now, geolocator }`), `Geolocator`, `ProjectsStackParamList` | core, ui, React Navigation |
| `survey` | `SurveyScreen`, `SurveyServicesProvider` (`{ surveys, projects, settings, signalProvider, signalUnavailableReason, performanceProvider, newId, now }`), `SurveyStackParamList`, `manualFrameId`. Internals: `SurveyRecorder` (framework-free), `PinBoard`, presentation helpers | core, ui, performance, React Navigation |
| `androidWifi` | `createAndroidWifiProvider({ bridge, newId, now, requestLocationPermission })`, `loadAndroidWifiBridge()` (null when the native module is absent), `AndroidWifiBridge` | core, expo (native module `modules/hm-android-wifi`) |
| `performance` | `createEndpointPerformanceProvider({ fetch, now, monotonic, newId, isOnWifi, deviceModel })`, `normalizeEndpointUrl`, `PROTOCOL` | core |
| `capabilities` | `detectCapabilities(env, probes)`, `CapabilityList`, `capabilityLabel` | core, ui |
| `ui` | `colors`, `spacing`, `availabilityColor`, `Button`, `TextField`, `Section`, `ListRow`, `Muted` | core |

Capability probes are registered in the app layer as stages ship. Without a probe a capability reports `not_implemented`. Fixed platform facts (no iOS RSSI; probe disabled) override any probe.

## Database (schema v1, `storage/migrations/001_initial.ts`)
`app_settings`, `projects`, `locations` (self-nested, cascade), `survey_sessions`, `survey_series`, `survey_gaps`, `samples` (context, source, network, position with a position-source consistency CHECK), `sample_metrics` (`metric`, `value`, `unit`; one row per measured metric). Foreign keys are on and deletes cascade.

## Native modules (`modules/`)
Expo local modules, autolinked from `modules/`. One per adapter.
- `hm-android-wifi` (Android only, Kotlin): `getStatus()`, `start(intervalMs)`, `stop()`, events `onPoll` (raw `WifiInfo` fields plus poll time) and `onError`. It reports every poll as-is; freshness decisions live in the TS provider so they are unit-tested.

## Survey flow
Location screen → `Survey` route (`{ projectId, locationId, mode }`). Starting creates a session (status recording). Signal mode starts the RSSI provider at once; Performance mode runs one test per button press at the marked point, local network and internet separately. Readings are validated, get a series (by `seriesKeyOf`) and survey context (pin position in `manual:<locationId>`, or none), then go through `appendSamples`. Pause stops the provider and opens a `paused` gap; a disconnect or stale data opens a gap that the next accepted reading closes. Leaving the screen finishes the session; backgrounding the app pauses it.

## Tools
`tools/perf-endpoint/server.js`: reference owned test endpoint (hm-perf v1, Node, no dependencies). The Jest suite runs the performance provider against it.

## App layer
`container.ts` builds the services (op-sqlite, repositories, `expo-crypto` ids, `expo-location` geolocator), recovers interrupted sessions, and registers providers and capability probes: Android RSSI when the native module is present, the owned-endpoint performance provider everywhere (`expo-network` supplies the Wi-Fi check). `navigation.tsx` is a native stack: Projects → Project → Location (pushed per level) → Survey, plus Capabilities. Modules own their route names (`ProjectsStackParamList`, `SurveyStackParamList`).

## Autosave (projects)
`AutosaveQueue` debounces for 500 ms, runs one save at a time with the latest value winning, and keeps a failed value for retry. `useAutosave(value | null, initial, save)` saves only once the value differs from what was loaded; null means the draft is invalid and nothing is written. Pending changes flush on `beforeRemove`, on unmount and when the app backgrounds. Deletes call `cancel()` first, and a location rename re-reads the row, so a late save cannot recreate deleted data.
