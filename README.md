# Heat Mapper Live

iOS/Android app for surveying Wi-Fi coverage and performance, building floor plans and AR heat maps, and exporting PDF reports.

- Engineering rules and constraints: [`CLAUDE.md`](CLAUDE.md)
- Modules and contracts: [`docs/modules.md`](docs/modules.md)
- Build stages and status: [`docs/progress.md`](docs/progress.md)

```sh
npm ci
npm run verify        # typecheck, lint, tests
npm run bundle:check  # Metro iOS + Android bundles
npm run ios           # needs Xcode; npm run android needs the Android SDK
```
