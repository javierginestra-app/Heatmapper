import {
  bandChannelFromFrequency,
  normalizeBssid,
  normalizeSsid,
  type MeasurementCapabilities,
  type MeasurementEvent,
  type MeasurementProvider,
  type ProviderState,
  type RssiReading,
} from '@/core';
import { type AndroidWifiBridge, type NativeWifiPoll } from './bridge';

export const ANDROID_WIFI_PROVIDER_ID = 'android-wifi';
export const POLL_INTERVAL_MS = 1_000;

export interface AndroidWifiProviderDeps {
  readonly bridge: AndroidWifiBridge;
  readonly newId: () => string;
  readonly now: () => number;
  /** Asks for fine location so Android reveals SSID/BSSID; RSSI works without it. */
  readonly requestLocationPermission: () => Promise<boolean>;
}

/** Fields Android refreshes together on each framework signal poll. */
const signature = (p: NativeWifiPoll) =>
  [p.rssiDbm, p.bssid, p.frequencyMhz, p.linkSpeedMbps, p.rxLinkSpeedMbps, p.txLinkSpeedMbps].join('|');

/**
 * Connected-AP RSSI from WifiManager, polled at about 1 Hz.
 *
 * Android does not timestamp WifiInfo, and the framework refreshes it on its own
 * schedule (often every ~3 s with the screen on). A poll becomes a reading only
 * when the link fields changed since the previous poll, so a cached value is never
 * stored twice; its collection window is the interval between those two polls.
 * The first poll after start or reconnect is a baseline of unknown age and is not emitted.
 */
export function createAndroidWifiProvider(deps: AndroidWifiProviderDeps): MeasurementProvider {
  const { bridge } = deps;
  const listeners = new Set<(event: MeasurementEvent) => void>();
  const emit = (event: MeasurementEvent) => listeners.forEach((l) => l(event));
  let subscriptions: { remove(): void }[] = [];
  let previous: NativeWifiPoll | null = null;
  let state: ProviderState = 'idle';
  let deviceModel: string | null = null;

  const setState = (next: ProviderState, reason: string | null) => {
    state = next;
    emit({ type: 'state', state: next, reason });
  };

  function onPoll(poll: NativeWifiPoll) {
    const rssi = poll.rssiDbm;
    if (!poll.connected || rssi === null || !Number.isInteger(rssi) || rssi <= -127 || rssi >= 0) {
      previous = null;
      if (state !== 'disconnected') setState('disconnected', 'Not connected to a Wi-Fi access point');
      return;
    }
    if (state !== 'running') setState('running', null);
    const last = previous;
    previous = poll;
    if (last === null || signature(last) === signature(poll) || poll.polledAtMs <= last.polledAtMs) return;

    const { band, channel } = bandChannelFromFrequency(poll.frequencyMhz);
    const reading: RssiReading = {
      kind: 'rssi',
      id: deps.newId(),
      rssiDbm: rssi,
      collectedStartMs: last.polledAtMs,
      collectedEndMs: poll.polledAtMs,
      receivedAtMs: Math.max(deps.now(), poll.polledAtMs),
      source: { kind: 'android_wifi', providerId: ANDROID_WIFI_PROVIDER_ID, deviceId: null, deviceModel },
      network: { ssid: normalizeSsid(poll.ssid), bssid: normalizeBssid(poll.bssid), channel, band },
    };
    emit({ type: 'reading', reading });
  }

  return {
    id: ANDROID_WIFI_PROVIDER_ID,

    async capabilities(): Promise<MeasurementCapabilities> {
      const status = await bridge.getStatus();
      const base = {
        mode: 'signal',
        sourceKind: 'android_wifi',
        metrics: ['rssi_dbm'],
        bands: ['2.4GHz', '5GHz', '6GHz'],
        minIntervalMs: POLL_INTERVAL_MS,
        requiresStationary: false,
      } as const;
      if (!status.wifiEnabled) return { ...base, availability: 'disabled', reason: 'Wi-Fi is turned off.' };
      const names = status.hasLocationPermission ? '' : ' Network name and BSSID stay unknown until location access is allowed.';
      const link = status.connected ? '' : ' Not connected to an access point right now.';
      return {
        ...base,
        availability: 'available',
        reason: `Connected access point only, polled once a second; new values arrive as often as Android refreshes them.${link}${names}`,
      };
    },

    async start() {
      if (subscriptions.length > 0) return;
      setState('starting', null);
      await deps.requestLocationPermission().catch(() => false);
      deviceModel = (await bridge.getStatus().catch(() => null))?.deviceModel ?? null;
      previous = null;
      subscriptions = [
        bridge.addPollListener(onPoll),
        bridge.addErrorListener(({ message }) => setState('error', message)),
      ];
      bridge.start(POLL_INTERVAL_MS);
    },

    async stop() {
      bridge.stop();
      subscriptions.forEach((s) => s.remove());
      subscriptions = [];
      previous = null;
      if (state !== 'idle' && state !== 'stopped') setState('stopped', null);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
