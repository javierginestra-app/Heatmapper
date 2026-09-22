import { type PerformanceSample, type RssiSample } from '@/core';

export const T0 = 1_790_000_000_000;

export function rssiSample(overrides: Partial<RssiSample> = {}): RssiSample {
  return {
    kind: 'rssi',
    id: 'r-1',
    rssiDbm: -55,
    collectedStartMs: T0,
    collectedEndMs: T0,
    receivedAtMs: T0 + 20,
    source: { kind: 'android_wifi', providerId: 'android-wifi', deviceId: null, deviceModel: 'Pixel 8' },
    network: { ssid: 'Office', bssid: 'aa:bb:cc:dd:ee:ff', channel: 36, band: '5GHz' },
    projectId: 'p1',
    locationId: 'l1',
    sessionId: 's1',
    seriesId: 'series-1',
    frameId: null,
    position: { x: 1, y: 0, z: 2 },
    positionSource: 'manual_pin',
    trackingQuality: 'manual',
    ...overrides,
  };
}

export function performanceSample(overrides: Partial<PerformanceSample> = {}): PerformanceSample {
  return {
    kind: 'performance',
    id: 'perf-1',
    scope: 'local_network',
    endpointId: 'lan-endpoint',
    metrics: { download_mbps: 410.5, upload_mbps: 220, latency_ms: 4, jitter_ms: 1.2, packet_loss_pct: null },
    bytesTransferred: 50_000_000,
    collectedStartMs: T0,
    collectedEndMs: T0 + 10_000,
    receivedAtMs: T0 + 10_050,
    source: { kind: 'performance_endpoint', providerId: 'owned-endpoint', deviceId: null, deviceModel: 'iPhone 15 Pro' },
    network: { ssid: 'Office', bssid: null, channel: null, band: null },
    projectId: 'p1',
    locationId: 'l1',
    sessionId: 's1',
    seriesId: 'series-2',
    frameId: null,
    position: null,
    positionSource: null,
    trackingQuality: 'not_available',
    ...overrides,
  };
}
