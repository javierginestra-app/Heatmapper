/** One poll of the connected access point, exactly as the native module reported it. */
export interface NativeWifiPoll {
  readonly polledAtMs: number;
  readonly connected: boolean;
  readonly rssiDbm: number | null;
  readonly bssid: string | null;
  readonly ssid: string | null;
  readonly frequencyMhz: number | null;
  readonly linkSpeedMbps: number | null;
  readonly rxLinkSpeedMbps: number | null;
  readonly txLinkSpeedMbps: number | null;
}

export interface NativeWifiStatus {
  readonly wifiEnabled: boolean;
  readonly connected: boolean;
  readonly hasLocationPermission: boolean;
  readonly apiLevel: number;
  readonly deviceModel: string;
}

/** The Kotlin module's surface (modules/hm-android-wifi), injectable for tests. */
export interface AndroidWifiBridge {
  getStatus(): Promise<NativeWifiStatus>;
  start(intervalMs: number): void;
  stop(): void;
  addPollListener(listener: (poll: NativeWifiPoll) => void): { remove(): void };
  addErrorListener(listener: (error: { message: string }) => void): { remove(): void };
}
