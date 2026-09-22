import { type Vec3 } from './geometry';
import {
  type MeasurementSource,
  type NetworkInfo,
  type PerformanceMetricKind,
  type TestScope,
} from './measurement';

/** How a sample's position was obtained. */
export type PositionSource = 'tracking' | 'manual_pin';

export type TrackingQuality = 'normal' | 'limited' | 'not_available' | 'manual';

/** What a MeasurementProvider emits: the radio/test result, with no survey context. */
interface ReadingBase {
  /** Unique per reading. Re-emitting an old scan with the same id is rejected as a duplicate. */
  readonly id: string;
  /** Epoch ms. Instantaneous readings have start === end. */
  readonly collectedStartMs: number;
  readonly collectedEndMs: number;
  /** Epoch ms when the phone received it (differs from collection for probes). */
  readonly receivedAtMs: number;
  readonly source: MeasurementSource;
  readonly network: NetworkInfo;
}

export interface RssiReading extends ReadingBase {
  readonly kind: 'rssi';
  /** Integer dBm as reported by the radio. Raw; never smoothed in storage. */
  readonly rssiDbm: number;
}

/** Null means the test did not measure that metric — not zero. */
export type PerformanceMetrics = Readonly<Record<PerformanceMetricKind, number | null>>;

export interface PerformanceReading extends ReadingBase {
  readonly kind: 'performance';
  readonly scope: TestScope;
  readonly endpointId: string;
  readonly metrics: PerformanceMetrics;
  readonly bytesTransferred: number;
}

export type Reading = RssiReading | PerformanceReading;

/** Survey context the survey module attaches when it stores a reading. */
export interface SampleContext {
  readonly projectId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly seriesId: string;
  readonly frameId: string | null;
  readonly position: Vec3 | null;
  readonly positionSource: PositionSource | null;
  readonly trackingQuality: TrackingQuality;
}

export type RssiSample = RssiReading & SampleContext;
export type PerformanceSample = PerformanceReading & SampleContext;
export type Sample = RssiSample | PerformanceSample;
