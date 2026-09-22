/**
 * The single RSSI policy used by the live view, heat maps and PDFs.
 * Bands are inclusive integer ranges; colours approximate the supplied gauge.
 */
export type RssiLevel = 'excellent' | 'good' | 'fair' | 'minimum' | 'unreliable' | 'weak' | 'very_weak';

export interface RssiBand {
  readonly level: RssiLevel;
  readonly label: string;
  /** Inclusive lower bound; null for the open-ended bottom band. */
  readonly minDbm: number | null;
  /** Inclusive upper bound; null for the open-ended top band. */
  readonly maxDbm: number | null;
  readonly color: string;
}

export const RSSI_BANDS: readonly RssiBand[] = [
  { level: 'excellent', label: 'Excellent', minDbm: -49, maxDbm: null, color: '#16A84A' },
  { level: 'good', label: 'Good', minDbm: -59, maxDbm: -50, color: '#8DC63F' },
  { level: 'fair', label: 'Fair', minDbm: -66, maxDbm: -60, color: '#E0D014' },
  { level: 'minimum', label: 'Minimum', minDbm: -69, maxDbm: -67, color: '#F9A61C' },
  { level: 'unreliable', label: 'Unreliable', minDbm: -79, maxDbm: -70, color: '#F58220' },
  { level: 'weak', label: 'Weak', minDbm: -89, maxDbm: -80, color: '#F06A24' },
  { level: 'very_weak', label: 'Very weak', minDbm: null, maxDbm: -90, color: '#ED1C24' },
];

/** Shown on legends as a reference point; values above it are still Excellent. */
export const RSSI_REFERENCE_MARKER_DBM = -30;

export const DEFAULT_RSSI_TARGET_DBM = -67;

/** Allowed range for a project's pass-target override. */
export const RSSI_TARGET_RANGE_DBM = { min: -90, max: -30 } as const;

/**
 * Classifies a value by threshold, so interpolated (non-integer) estimates land
 * in the band whose lower bound they meet: -49.5 is Good, not Excellent.
 */
export function classifyRssi(dbm: number): RssiBand {
  if (!Number.isFinite(dbm)) throw new RangeError(`RSSI must be finite, got ${dbm}`);
  for (const band of RSSI_BANDS) {
    if (band.minDbm === null || dbm >= band.minDbm) return band;
  }
  throw new Error('unreachable: RSSI_BANDS has an open-ended bottom band');
}

export function resolveRssiTarget(projectOverrideDbm: number | null): number {
  if (projectOverrideDbm === null) return DEFAULT_RSSI_TARGET_DBM;
  const { min, max } = RSSI_TARGET_RANGE_DBM;
  if (!Number.isInteger(projectOverrideDbm) || projectOverrideDbm < min || projectOverrideDbm > max) {
    throw new RangeError(`RSSI target must be an integer from ${min} to ${max} dBm`);
  }
  return projectOverrideDbm;
}

/** Pass means signal meets the target. It says nothing about internet performance. */
export function passesRssiTarget(dbm: number, targetDbm: number = DEFAULT_RSSI_TARGET_DBM): boolean {
  if (!Number.isFinite(dbm)) throw new RangeError(`RSSI must be finite, got ${dbm}`);
  return dbm >= targetDbm;
}

export function formatBandRange(band: RssiBand): string {
  if (band.maxDbm === null) return `≥ ${band.minDbm}`;
  if (band.minDbm === null) return `≤ ${band.maxDbm}`;
  return `${band.maxDbm} to ${band.minDbm}`;
}
