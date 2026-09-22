import { type Reading } from './samples';

/**
 * Readings with the same key belong to one series. A change of source, network
 * or metric set starts a new series so they are never averaged together.
 */
export function seriesKeyOf(reading: Reading): string {
  const { source, network } = reading;
  const metric = reading.kind === 'rssi' ? ['rssi'] : ['performance', reading.scope, reading.endpointId];
  return JSON.stringify([
    source.kind,
    source.providerId,
    source.deviceId,
    network.ssid,
    network.bssid,
    network.band,
    ...metric,
  ]);
}
