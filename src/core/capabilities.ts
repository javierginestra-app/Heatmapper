export type CapabilityId =
  | 'wifi_rssi_native'
  | 'performance_test'
  | 'ar_tracking'
  | 'room_scan'
  | 'depth_sensing'
  | 'pdf_export'
  | 'external_probe'
  | 'subscriptions';

/**
 * - available: works on this device now
 * - unsupported: the platform or hardware cannot do it
 * - disabled: turned off by the user
 * - not_implemented: planned for a later build stage
 * - unknown: detection failed
 */
export type Availability = 'available' | 'unsupported' | 'disabled' | 'not_implemented' | 'unknown';

export interface CapabilityStatus {
  readonly id: CapabilityId;
  readonly availability: Availability;
  /** Always set, so the UI never shows a bare state without an explanation. */
  readonly reason: string;
}
