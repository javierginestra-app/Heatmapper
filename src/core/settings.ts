export interface AppSettings {
  /** Off by default. When off there is no BLE scanning, pairing or probe subscription. */
  readonly externalProbeEnabled: boolean;
  /** Base URL of an owned test endpoint on the local network; empty when not configured. */
  readonly localTestEndpoint: string;
  /** Base URL of an owned test endpoint on the internet; empty when not configured. */
  readonly internetTestEndpoint: string;
  /** Hard cap on bytes one performance test may transfer, in megabytes. */
  readonly performanceByteCapMb: number;
}

export const PERFORMANCE_BYTE_CAP_RANGE_MB = { min: 1, max: 100 } as const;

export const DEFAULT_SETTINGS: AppSettings = {
  externalProbeEnabled: false,
  localTestEndpoint: '',
  internetTestEndpoint: '',
  performanceByteCapMb: 20,
};
