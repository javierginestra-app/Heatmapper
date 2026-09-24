import {
  classifyRssi,
  PERFORMANCE_BYTE_CAP_RANGE_MB,
  passesRssiTarget,
  type GapReason,
  type NetworkInfo,
  type PerformanceReading,
  type ProviderState,
  type Reading,
  type Vec3,
} from '@/core';

/** Display-only helpers for the survey screen. Stored values are never altered. */

export const GAP_LABEL: Readonly<Record<GapReason, string>> = {
  paused: 'Paused',
  source_disconnected: 'Source disconnected',
  source_disabled: 'Source disabled',
  tracking_lost: 'Tracking lost',
  stale_data: 'No new reading',
};

export const PROVIDER_STATE_LABEL: Readonly<Record<ProviderState, string>> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Receiving',
  stopped: 'Stopped',
  disconnected: 'Disconnected',
  error: 'Error',
};

export function describeNetwork(network: NetworkInfo): string {
  const parts = [
    network.ssid ?? 'SSID unknown',
    network.bssid ?? 'BSSID unknown',
    network.band ?? 'band unknown',
    network.channel === null ? 'channel unknown' : `ch ${network.channel}`,
  ];
  return parts.join(' · ');
}

export function formatAge(ageMs: number): string {
  if (ageMs < 0) return 'just now';
  if (ageMs < 10_000) return `${(ageMs / 1000).toFixed(1)} s ago`;
  if (ageMs < 120_000) return `${Math.round(ageMs / 1000)} s ago`;
  return `${Math.round(ageMs / 60_000)} min ago`;
}

export interface RssiView {
  readonly value: string;
  readonly label: string;
  readonly color: string;
  readonly meetsTarget: boolean;
}

export function rssiView(reading: Reading, targetDbm: number): RssiView | null {
  if (reading.kind !== 'rssi') return null;
  const band = classifyRssi(reading.rssiDbm);
  return { value: `${reading.rssiDbm} dBm`, label: band.label, color: band.color, meetsTarget: passesRssiTarget(reading.rssiDbm, targetDbm) };
}

const fmt = (value: number | null, unit: string, digits = 1) => (value === null ? 'not measured' : `${value.toFixed(digits)} ${unit}`);

export function performanceLines(reading: PerformanceReading): { label: string; value: string }[] {
  const m = reading.metrics;
  return [
    { label: 'Download', value: fmt(m.download_mbps, 'Mbps') },
    { label: 'Upload', value: fmt(m.upload_mbps, 'Mbps') },
    { label: 'Latency (HTTP)', value: fmt(m.latency_ms, 'ms') },
    { label: 'Jitter', value: fmt(m.jitter_ms, 'ms') },
    { label: 'Loss', value: fmt(m.packet_loss_pct, '%', 0) },
    { label: 'Data used', value: `${(reading.bytesTransferred / 1_000_000).toFixed(1)} MB` },
  ];
}

/** Converts a tap on the pin board (points) to metres in the location's manual frame. */
export function pinFromTouch(touchX: number, touchY: number, pointsPerMetre: number, widthM: number, depthM: number): Vec3 | null {
  if (!(pointsPerMetre > 0)) return null;
  const x = touchX / pointsPerMetre;
  const z = touchY / pointsPerMetre;
  if (x < 0 || z < 0 || x > widthM || z > depthM) return null;
  return { x: Math.round(x * 10) / 10, y: 0, z: Math.round(z * 10) / 10 };
}

export const BOARD_LIMITS_M = { min: 1, max: 100 } as const;

export function parseDimension(text: string): number | null {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= BOARD_LIMITS_M.min && value <= BOARD_LIMITS_M.max ? value : null;
}

export function parseByteCapMb(text: string): number | null {
  const value = Number(text);
  const { min, max } = PERFORMANCE_BYTE_CAP_RANGE_MB;
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}
