# Progress

| Stage | Module | Status |
|---|---|---|
| 0 | Foundation | Done — JS verified; not yet launched on a device |
| 1 | Projects | Done — JS verified; not yet exercised on a device |
| 2 | Survey | Done — JS verified; Kotlin module not compiled; not exercised on a device |
| 3A | Mapping: geometry | Next |
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
- Device builds: `eas.json` has a `preview` profile (internal distribution, Android APK with the JS bundle embedded, so no Metro server is needed). Run `npx eas-cli build -p android --profile preview` after `eas init` links an Expo project. `npx expo prebuild -p android` succeeds and the generated manifest has cleartext traffic, fine location and autolinks `hm-android-wifi`; no Gradle build has run yet (the Android SDK is not installed in the cloud build environment).
- Bundle id `app.heatmapperlive` is a placeholder until store registration (Stage 6).
- Expo CLI logs "Using src/app as the root directory for Expo Router" because of the folder name. It is harmless while expo-router isn't installed. Use React Navigation (Stage 1), not expo-router.

## Stage 1 — Projects
- Built: `ProjectRepository` on SQLite; project/location rules and tree helpers in core; projects module with list, project and location screens, Building → Floor → Room nesting (levels may be skipped, never inverted), tappable breadcrumbs, autosave (offline, debounced, flushed on leave/background), "Use current location" (expo-location, foreground only), per-project RSSI target, cascade-aware delete confirmations, survey history (scoped to a location and its descendants); capability screen moved behind the "Device" header button.
- Contract change: `SurveyRepository` split. Project/location methods and `listSessionHistory` moved to the new `ProjectRepository`; `SurveyRepository` keeps sessions, series, gaps and samples (Stage 2).
- Verified: `npm run verify` (88 tests, including the restart gate: a file database closed and reopened keeps projects and the tree) and `npm run bundle:check`.
- Not verified on a device: navigation, keyboard handling, autosave timing, location permission prompt. Hardware check: create a project with nested locations, force-quit, relaunch and confirm everything is there; deny then allow location permission.
- Migrations: none (schema v1 already had the tables).
- Dependencies added: @react-navigation/native + native-stack, react-native-screens, react-native-safe-area-context, expo-crypto, expo-location (config plugin adds the when-in-use permission text).

## Stage 2 — Survey
- Built: `SurveyRepository` on SQLite (sessions, series, gaps as upserts; `appendSamples` validates with `validateSampleBatch`, checks stored ids for duplicates, then rejects samples whose session is not recording or whose series is missing, foreign or has a different series key; metric rows with units, unmeasured performance metrics are not stored and read back as null; crash recovery turns sessions left recording into paused with an open gap). `SurveyRecorder` (survey module): record/pause/resume/finish, one series per source/network/metric set, gaps for pause, disconnect (opened at once, closed by the next fresh reading) and stale data (no accepted reading for 5 s), manual map pins, performance tests at a marked point (result discarded if the point moves during the test). Survey screen with source availability and reason, live raw RSSI with band colour and target pass/fail from the shared policy, network metadata (unknown shown as unknown), reading age and measured cadence, saved/rejected/gap/series counts, a metre-grid pin board, and local/internet performance results side by side. Entry point: "Signal (RSSI) survey" / "Performance survey" on the Location screen.
- Android RSSI adapter: Kotlin Expo module `modules/hm-android-wifi` polls `WifiManager.connectionInfo` every 1 s (no scans, foreground only). The TS provider (`src/modules/androidWifi`) emits a reading only when the link fields (RSSI, BSSID, frequency, link speeds) changed since the previous poll, so a cached value is never stored twice; its collection window is the interval between the two polls. The first poll after start or reconnect is a baseline of unknown age and is dropped. Effective cadence is whatever Android refreshes (often ~3 s with the screen on), shown live as readings/s. SSID/BSSID need fine location; without it they stay null.
- Performance adapter (`src/modules/performance`): owned endpoint only, protocol `hm-perf` v1, reference server `tools/perf-endpoint/server.js` (no dependencies). Wi-Fi required (`expo-network`), 10 HTTP round trips for latency/jitter/loss, then download and upload splitting the byte cap (default 20 MB, 1–100 MB), 60 s time limit, download refused if it declares more than requested. Local network and internet use separate endpoints, scopes and series. No Ookla adapter.
- Capability probes registered in `container.ts`: native RSSI (Android: from the native module; missing module → unknown with a rebuild hint; iOS stays unsupported), performance test (both platforms).
- Contract changes: `SurveyRepository` gained `getSession`, `listSeries`, `listGaps`, `interruptOpenSessions`; gaps are upserts. `RejectionReason` gained `context_mismatch`. `AppSettings` gained `localTestEndpoint`, `internetTestEndpoint`, `performanceByteCapMb`. Core gained `wifi.ts` (frequency → band/channel, SSID/BSSID placeholder normalization). `ProjectsStackParamList` includes the survey module's `Survey` route.
- Platform config: Android `usesCleartextTraffic` (LAN endpoints are usually plain HTTP) via an inline config plugin; iOS `NSLocalNetworkUsageDescription` and `NSAllowsLocalNetworking`; location permission text now mentions Wi-Fi names.
- Verified: `npm run verify` (147 tests, including performance tests against the real reference server on localhost, byte-cap and Wi-Fi-only enforcement, recorder gaps/series/pins on a real SQLite database, and a close/reopen restart check) and `npm run bundle:check`. `expo-modules-autolinking` resolves the Kotlin module.
- Not verified: the Kotlin module has not been compiled (no Android SDK or Kotlin compiler here) and nothing ran on a device. Hardware checks (Android): build with `npx expo run:android`; the Device screen shows native RSSI Available; a Signal survey shows changing dBm, SSID/BSSID after allowing location, and a cadence near Android's refresh rate; turn Wi-Fi off mid-survey and confirm a "Source disconnected" gap and no readings; background the app and confirm it pauses. Performance (both platforms): run `node tools/perf-endpoint/server.js` on a LAN machine, set it as the local endpoint, run a test at a marked point, confirm data used stays under the cap and the test refuses to run on cellular. iOS: confirm the local network permission prompt.
- Known limits: stillness during performance tests is the user's responsibility (not sensed). Latency is HTTP round-trip time, not ICMP. Throughput is timed in JavaScript over one HTTP request each way and has not been checked against a reference tool. Performance readings have null SSID/BSSID. Manual pins lie on the floor plane (y = 0) in a per-location frame (`manual:<locationId>`) sized by the user; Stage 3A aligns this frame with plans and tracking. A session paused by a crash cannot be resumed; start a new one. Performance thresholds are not configured yet (Stage 3B/4).
- Migrations: none (schema v1 already had the tables).
- Dependencies added: expo-network.

## Next: Stage 3A — Mapping: geometry
`TrackingProvider` implementations (ARKit/RoomPlan on LiDAR iOS devices, ARCore planes/depth on Android), poses in the survey world frame with relocalization on resume, tracking-state prompts, placement paused when tracking fails, and the fallbacks (manual walls, imported plans, measured-distance calibration) replacing the Stage 2 pin board's hand-sized frame.
