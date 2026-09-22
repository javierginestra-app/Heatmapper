export interface AppSettings {
  /** Off by default. When off there is no BLE scanning, pairing or probe subscription. */
  readonly externalProbeEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  externalProbeEnabled: false,
};
