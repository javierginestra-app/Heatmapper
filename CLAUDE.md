# Heat Mapper Live

iOS/Android app for Wi-Fi coverage and performance surveys, floor plans, AR heat maps and PDF reports. Paid through a monthly store subscription.

Before any change, read this file, `docs/modules.md` and `docs/progress.md`, then open only the files involved. Build one stage at a time (see progress). "Next stage" means the next unfinished stage only. "Update module X" means changes stay in X plus any contract change it needs.

## Stack
Expo SDK 52 (dev client, not Expo Go), React Native 0.76, strict TypeScript, op-sqlite with numbered migrations, Jest (Node, `node:sqlite` stands in for op-sqlite). Native code goes in isolated Swift/Kotlin Expo modules, one per adapter. AR rendering and processing stay native and on device. No LLM calls per frame.

## Layout and boundaries (enforced by `eslint/boundaries.js`)
- `src/core/`: models, contracts, policies. Imports only core. No React, React Native, Expo or native SDKs.
- `src/modules/<name>/`: one feature per folder. Public API is `index.ts`. Other modules import `@/modules/<name>` only, never its internals, and never `src/app`.
- `src/app/`: navigation and dependency wiring (`container.ts`). Providers are registered here only.
- Tests live in `__tests__/` and may import internals. Fakes and mocks stay there or in a clearly labelled demo mode.

## Commands
`npm run verify` (typecheck + lint + tests) · `npm run bundle:check` (Metro iOS/Android bundles, `CI=1 EXPO_OFFLINE=1`) · `npm run ios|android` (needs Xcode/Android SDK).

## Non-negotiable rules
- **Honest status.** Never label a simulated or untested integration complete. Every capability shows available, unsupported, disabled, not implemented or unknown, with a reason.
- **Two modes.** Performance mode (Mbps, latency, jitter, loss) and Signal/RSSI mode. Never convert speed to dBm. Test local network and internet separately. Only on Wi-Fi, stationary at a marked point, with capped bytes. An owned endpoint comes first. An Ookla adapter stays disabled until SDK access and terms are verified.
- **iOS has no general live Wi-Fi RSSI API.** HotspotHelper is not a solution. iOS gets RSSI only through the external probe. Android RSSI (`WifiInfo.getRssi`) and probe RSSI use separate adapters and sources.
- **Samples.** `RssiSample | PerformanceSample` (see `src/core/samples.ts`). Raw values are stored; smoothing is for display only. Unknown metadata is null. A change of source, network or metric set starts a new series (`seriesKeyOf`). Reject invalid payloads, duplicate ids and stale readings (`validateSampleBatch`). Aim for about 1 fresh RSSI reading/s; never reuse an old scan as a new sample.
- **Mapping.** Geometry, poses and samples share one world frame (metres). Relocalize resumed scans. Pause placement when tracking fails. Prompt "Move slowly", "Hold still" or "Scan more surfaces" only when the tracking state justifies it. Use RoomPlan on LiDAR iOS devices. On Android, use ARCore planes/depth with separate reconstruction. Fallbacks: manual walls, imported plans, measured-distance calibration.
- **Heat maps are estimates.** Measurements exist only at the phone/probe position. Interpolate conservatively inside surveyed rooms, within documented distance and height limits, never across walls or floors. Unknown areas are gray. Never present surface colour as a measured 3D radio volume. AR rendering is separate from sampling.
- **RSSI policy** lives only in `src/core/policies/rssiPolicy.ts`, shared by the UI, heat maps and PDFs. Default pass is ≥ -67 dBm, overridable per project. -68/-69 show as Minimum but fail. -30 is a legend marker, not a cap. Performance thresholds are configured separately.
- **Coverage %** = passing eligible floor-grid cells / eligible cells, excluding unknown cells. Report assessed area / total floor area separately, with survey height and interpolation rules. Withhold the percentage when scale or evidence is insufficient. An RSSI pass never implies internet performance.
- **Reports** render from immutable snapshots, and their metrics must match saved data.
- **External probe** (`externalProbeEnabled`, default false). Off means no BLE scanning, pairing or subscriptions. A disconnect stops samples at once and records a gap; never fabricate a reading or switch mode silently. BLE only transports Wi-Fi readings (never BLE RSSI). Prototype is ESP32-C5 (2.4/5 GHz; 6 GHz unavailable). Firmware lives in `firmware/probe-esp32-c5/`, uses a versioned GATT protocol and builds independently.
- **Billing.** StoreKit/Play Billing only. Entitlements are verified. An expired subscription keeps saved surveys and reports accessible.
- Report any missing hardware, SDK credentials or native tooling explicitly. Record migrations and hardware tests in `docs/progress.md`.
