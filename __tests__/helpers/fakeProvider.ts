import {
  type MeasurementCapabilities,
  type MeasurementConfig,
  type MeasurementEvent,
  type MeasurementProvider,
} from '@/core';

/** Test double: records start/stop calls and lets the test emit events. */
export class FakeProvider implements MeasurementProvider {
  readonly id = 'fake';
  readonly starts: MeasurementConfig[] = [];
  stops = 0;
  /** Performance tests: called inside start() so the test can emit a result. */
  onStart: ((config: MeasurementConfig) => Promise<void> | void) | null = null;
  private readonly listeners = new Set<(e: MeasurementEvent) => void>();

  async capabilities(): Promise<MeasurementCapabilities> {
    return { mode: 'signal', sourceKind: 'android_wifi', availability: 'available', reason: 'fake', metrics: ['rssi_dbm'], bands: [], minIntervalMs: 1_000, requiresStationary: false };
  }

  async start(config: MeasurementConfig) {
    this.starts.push(config);
    await this.onStart?.(config);
  }

  async stop() {
    this.stops += 1;
  }

  subscribe(listener: (e: MeasurementEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: MeasurementEvent) {
    this.listeners.forEach((l) => l(event));
  }

  get listenerCount() {
    return this.listeners.size;
  }
}
