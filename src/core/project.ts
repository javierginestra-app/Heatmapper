import { type MeasurementMode, type MeasurementSourceKind, type NetworkInfo, type TestScope } from './measurement';

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly description: string | null;
  /** Project override of the RSSI pass target; null uses the default. */
  readonly rssiTargetDbm: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export type LocationKind = 'building' | 'floor' | 'room';

/** Building → Floor → Room tree; parentId null means a direct child of the project. */
export interface Location {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly kind: LocationKind;
  readonly name: string;
  readonly sortOrder: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export type SessionStatus = 'recording' | 'paused' | 'completed';

export interface SurveySession {
  readonly id: string;
  readonly projectId: string;
  readonly locationId: string;
  readonly mode: MeasurementMode;
  readonly status: SessionStatus;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
}

/** One uninterrupted stream from one source, network and metric set. */
export interface SurveySeries {
  readonly id: string;
  readonly sessionId: string;
  readonly seriesKey: string;
  readonly kind: 'rssi' | 'performance';
  readonly sourceKind: MeasurementSourceKind;
  readonly providerId: string;
  readonly deviceId: string | null;
  readonly network: NetworkInfo;
  readonly scope: TestScope | null;
  readonly endpointId: string | null;
  readonly startedAtMs: number;
}

export type GapReason = 'paused' | 'source_disconnected' | 'source_disabled' | 'tracking_lost' | 'stale_data';

/** A period with no valid readings. Gaps are recorded, never filled. */
export interface SurveyGap {
  readonly id: string;
  readonly sessionId: string;
  readonly seriesId: string | null;
  readonly reason: GapReason;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
}
