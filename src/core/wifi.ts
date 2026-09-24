import { type WifiBand } from './measurement';

export interface BandChannel {
  readonly band: WifiBand | null;
  readonly channel: number | null;
}

/**
 * Maps a centre frequency (MHz) to band and channel per IEEE 802.11.
 * Unknown or out-of-band frequencies return nulls rather than a guess.
 */
export function bandChannelFromFrequency(mhz: number | null): BandChannel {
  if (mhz === null || !Number.isInteger(mhz) || mhz <= 0) return { band: null, channel: null };
  if (mhz === 2484) return { band: '2.4GHz', channel: 14 };
  if (mhz >= 2412 && mhz <= 2472 && (mhz - 2407) % 5 === 0) return { band: '2.4GHz', channel: (mhz - 2407) / 5 };
  // 6 GHz is checked before 5 GHz because 5955+ would otherwise map to 5 GHz channel numbers.
  if (mhz === 5935) return { band: '6GHz', channel: 2 };
  if (mhz >= 5955 && mhz <= 7115 && (mhz - 5950) % 5 === 0) return { band: '6GHz', channel: (mhz - 5950) / 5 };
  if (mhz >= 5160 && mhz <= 5885 && (mhz - 5000) % 5 === 0) return { band: '5GHz', channel: (mhz - 5000) / 5 };
  return { band: null, channel: null };
}

/** Values Android reports when location access is missing or nothing is connected. */
const REDACTED_BSSIDS = new Set(['02:00:00:00:00:00', '00:00:00:00:00:00']);
const REDACTED_SSIDS = new Set(['<unknown ssid>', '']);

export function normalizeBssid(bssid: string | null): string | null {
  if (bssid === null) return null;
  const lower = bssid.toLowerCase();
  return REDACTED_BSSIDS.has(lower) || !/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(lower) ? null : lower;
}

/** Strips the quotes Android puts around UTF-8 SSIDs; placeholders become null. */
export function normalizeSsid(ssid: string | null): string | null {
  if (ssid === null) return null;
  const unquoted = ssid.length >= 2 && ssid.startsWith('"') && ssid.endsWith('"') ? ssid.slice(1, -1) : ssid;
  return REDACTED_SSIDS.has(unquoted) ? null : unquoted;
}
