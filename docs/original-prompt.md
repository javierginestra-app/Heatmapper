# Heat Mapper Live — Build Prompt

## Role
Senior mobile engineer. Build **Heat Mapper Live**: a paid (monthly subscription) iOS + Android app that measures Wi-Fi RSSI in real time through an AR camera view, builds a floor plan from the scan, and exports a PDF coverage report.

## Stack (default; change if told)
- React Native (Expo dev client) + TypeScript; native modules for AR, RSSI, and scanning.
- iOS: ARKit + RoomPlan (LiDAR). Android: ARCore (Depth API when available).
- Local DB: SQLite. Billing: StoreKit 2 / Play Billing, one monthly tier, paywall before the first scan.

## Hard constraints (flag them, don't hide them)
- **iOS doesn't give third-party apps RSSI.** `NEHotspotNetwork.signalStrength` needs the Hotspot Helper entitlement. Build behind `RssiSource`: Android `WifiManager` (native) / iOS (entitlement, or external BLE/USB probe, or "not supported"). Say which path you pick.
- Android: connected-AP RSSI polled about 1 Hz; scans throttled (4 per 2 min). Use connected RSSI for live readings, scans only for AP discovery.
- RSSI is measured **at the phone**. Surfaces show interpolated values; they are not measurements taken at the surface.

## Signal thresholds (dBm; one config table used everywhere)
| RSSI | Label | Color |
|---|---|---|
| ≥ -49 (-30 or better is best) | Excellent | #16A84A |
| -50 to -59 | Good | #8DC63F |
| -60 to -66 | Fair | #E0D014 |
| -67 to -69 | Minimum | #F9A61C |
| -70 to -79 | Unreliable | #F58220 |
| -80 to -89 | Weak | #F06A24 |
| ≤ -90 | Very weak | #ED1C24 |

Pass line = -67 dBm (Minimum). Coverage and dead-zone stats use it.

## Modules

### M1 — Projects & Nesting
- Project: name, address/GPS, description, created/updated.
- Nested `Location` tree (Building → Floor → Room, any depth); each node can hold scans.
- CRUD, rename, reorder, delete with confirm. Scanner button on every location.
- Done when: create a project, nest 3 levels, persist across restarts.

### M2 — RSSI Live Feed (AR)
- Camera opens with an AR overlay. A dot matrix is raycast onto detected planes/mesh so it follows walls, floor, and furniture, and it updates as the mesh updates.
- Each sample = {pose, timestamp, RSSI, BSSID, SSID, band/channel}, stored at the device's world position.
- Dots are colored by interpolated RSSI (IDW from nearby samples) and labeled with the dBm value at a readable density.
- HUD: current RSSI, SSID/BSSID, band, sample count, "move slower" hint. Keep 30 fps; throttle the overlay, not the tracking.
- Done when: walking a room leaves world-anchored colored dots that stay put when you look away and back.

### M3 — Floor Plan & 3D Heat Map
- Build geometry from the scan: walls, doors, windows, rooms (RoomPlan on iOS; ARCore planes + depth → wall segments on Android).
- Manual editing: draw/move/delete walls, split/label rooms, measuring tool with a scale check.
- Heat map: interpolate samples over the floor plane (IDW, walls lower the weight), shown as 2D top-down and a 3D extruded view. Toggle by AP/band.
- Stats per room: min/avg/max RSSI, % area ≥ -67 dBm, dead zones.
- Done when: a scanned room produces an editable plan with a heat layer that matches the live readings.

### M4 — Reports (PDF)
- Contents: cover (project, location, date, tech), summary pass/fail vs. threshold, plan + heat map per floor, room stats table, AP list, dead-zone callouts, notes/photos.
- Generated on device; share sheet export. Optional logo/branding in settings.
- Done when: a one-tap PDF renders correctly for a multi-room project.

## Data model (minimum)
`Project` → `Location` (self-nested) → `Scan` → `Sample[]`, `Geometry` (walls/rooms JSON), `Report`.

## Delivery
Build in order M1→M4. For each module: short plan, code, unit tests for pure logic (interpolation, thresholds, tree ops), and a list of open risks. Ask only when a decision blocks you; otherwise pick a sensible default and note it.
