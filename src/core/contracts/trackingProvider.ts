import { type Availability } from '../capabilities';
import { type Quaternion, type Vec3 } from '../geometry';
import { type TrackingQuality } from '../samples';
import { type Unsubscribe } from './common';

export type TrackingLimitReason =
  | 'initializing'
  | 'excessive_motion'
  | 'insufficient_features'
  | 'relocalizing';

export interface Pose {
  readonly timestampMs: number;
  readonly frameId: string;
  readonly position: Vec3;
  readonly orientation: Quaternion;
  readonly quality: TrackingQuality;
  readonly limitReason: TrackingLimitReason | null;
}

export interface TrackingCapabilities {
  readonly availability: Availability;
  readonly reason: string;
  readonly roomScan: boolean;
  readonly depth: boolean;
  readonly relocalization: boolean;
}

export interface TrackingConfig {
  readonly sessionId: string;
  /** Saved world map to relocalize against when resuming a scan. */
  readonly resumeMapId: string | null;
}

export type TrackingEvent =
  | { readonly type: 'pose'; readonly pose: Pose }
  | { readonly type: 'state'; readonly quality: TrackingQuality; readonly limitReason: TrackingLimitReason | null };

/** Device pose in the survey's world frame. Rendering is separate from radio sampling. */
export interface TrackingProvider {
  readonly id: string;
  capabilities(): Promise<TrackingCapabilities>;
  start(config: TrackingConfig): Promise<void>;
  /** Returns the saved world map id, if the platform can persist one. */
  stop(): Promise<{ readonly mapId: string | null }>;
  subscribe(listener: (event: TrackingEvent) => void): Unsubscribe;
}
