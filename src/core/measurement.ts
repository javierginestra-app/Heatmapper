export type MeasurementMode = 'signal' | 'performance';

export type MetricKind =
  | 'rssi_dbm'
  | 'download_mbps'
  | 'upload_mbps'
  | 'latency_ms'
  | 'jitter_ms'
  | 'packet_loss_pct';

/** Units are stored with every value; they are never inferred from a column name alone. */
export const METRIC_UNITS: Readonly<Record<MetricKind, string>> = {
  rssi_dbm: 'dBm',
  download_mbps: 'Mbps',
  upload_mbps: 'Mbps',
  latency_ms: 'ms',
  jitter_ms: 'ms',
  packet_loss_pct: '%',
};

export type PerformanceMetricKind = Exclude<MetricKind, 'rssi_dbm'>;

/** Where a reading physically came from. Android RSSI and probe RSSI are different sources. */
export type MeasurementSourceKind = 'android_wifi' | 'external_probe' | 'performance_endpoint';

export interface MeasurementSource {
  readonly kind: MeasurementSourceKind;
  readonly providerId: string;
  readonly deviceId: string | null;
  readonly deviceModel: string | null;
}

/** Local-network and internet tests are reported separately, never merged. */
export type TestScope = 'local_network' | 'internet';

export type WifiBand = '2.4GHz' | '5GHz' | '6GHz';

export const WIFI_BANDS: readonly WifiBand[] = ['2.4GHz', '5GHz', '6GHz'];

/** Unknown metadata stays null; it is never guessed. */
export interface NetworkInfo {
  readonly ssid: string | null;
  readonly bssid: string | null;
  readonly channel: number | null;
  readonly band: WifiBand | null;
}
