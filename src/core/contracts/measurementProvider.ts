import { type Availability } from '../capabilities';
import {
  type MeasurementMode,
  type MeasurementSourceKind,
  type MetricKind,
  type TestScope,
  type WifiBand,
} from '../measurement';
import { type GapReason } from '../project';
import { type Reading } from '../samples';
import { type Unsubscribe } from './common';

export interface MeasurementCapabilities {
  readonly mode: MeasurementMode;
  readonly sourceKind: MeasurementSourceKind;
  readonly availability: Availability;
  readonly reason: string;
  readonly metrics: readonly MetricKind[];
  readonly bands: readonly WifiBand[];
  /** Fastest cadence of genuinely new readings; null when readings are on demand. */
  readonly minIntervalMs: number | null;
  /** Performance tests must be taken standing still at a marked point. */
  readonly requiresStationary: boolean;
}

export interface PerformanceTestConfig {
  readonly endpointId: string;
  readonly scope: TestScope;
  /** Hard cap on bytes a single test may transfer. */
  readonly maxBytes: number;
  readonly maxDurationMs: number;
}

export interface MeasurementConfig {
  readonly sessionId: string;
  /** Live RSSI tracks one BSSID; broad scans are discovery only. */
  readonly targetBssid: string | null;
  readonly performance: PerformanceTestConfig | null;
}

export type ProviderState = 'idle' | 'starting' | 'running' | 'stopped' | 'disconnected' | 'error';

export type MeasurementEvent =
  | { readonly type: 'reading'; readonly reading: Reading }
  | { readonly type: 'state'; readonly state: ProviderState; readonly reason: string | null }
  | { readonly type: 'gap'; readonly reason: GapReason; readonly startedAtMs: number; readonly endedAtMs: number | null };

/**
 * A source of Wi-Fi measurements. Emitted readings are untrusted until the
 * survey module validates them; providers never fabricate or repeat readings.
 */
export interface MeasurementProvider {
  readonly id: string;
  capabilities(): Promise<MeasurementCapabilities>;
  start(config: MeasurementConfig): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (event: MeasurementEvent) => void): Unsubscribe;
}
