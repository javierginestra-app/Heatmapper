import { validateReading, type MeasurementEvent, type RssiReading } from '@/core';
import { type AndroidWifiBridge, type NativeWifiPoll } from '@/modules/androidWifi/bridge';
import { createAndroidWifiProvider } from '@/modules/androidWifi/provider';
import { T0 } from './helpers/fixtures';
import { sequentialIds } from './helpers/surveyFixtures';

function fakeBridge(status: Partial<Awaited<ReturnType<AndroidWifiBridge['getStatus']>>> = {}) {
  let listener: ((p: NativeWifiPoll) => void) | null = null;
  const bridge: AndroidWifiBridge & { started: number[]; stopped: number } = {
    started: [],
    stopped: 0,
    getStatus: async () => ({ wifiEnabled: true, connected: true, hasLocationPermission: true, apiLevel: 34, deviceModel: 'Google Pixel 8', ...status }),
    start: (ms) => void bridge.started.push(ms),
    stop: () => void (bridge.stopped += 1),
    addPollListener: (l) => ((listener = l), { remove: () => (listener = null) }),
    addErrorListener: () => ({ remove: () => undefined }),
  };
  return { bridge, poll: (p: NativeWifiPoll) => listener?.(p), hasListener: () => listener !== null };
}

const poll = (seconds: number, overrides: Partial<NativeWifiPoll> = {}): NativeWifiPoll => ({
  polledAtMs: T0 + seconds * 1_000,
  connected: true,
  rssiDbm: -60,
  bssid: 'AA:BB:CC:DD:EE:FF',
  ssid: '"Office"',
  frequencyMhz: 5180,
  linkSpeedMbps: 866,
  rxLinkSpeedMbps: 866,
  txLinkSpeedMbps: 780,
  ...overrides,
});

async function setup(status?: Parameters<typeof fakeBridge>[0]) {
  const fake = fakeBridge(status);
  let clock = T0;
  const provider = createAndroidWifiProvider({
    bridge: fake.bridge,
    newId: sequentialIds('reading'),
    now: () => clock,
    requestLocationPermission: async () => true,
  });
  const events: MeasurementEvent[] = [];
  provider.subscribe((e) => events.push(e));
  await provider.start({ sessionId: 's1', targetBssid: null, performance: null });
  const readings = () => events.flatMap((e) => (e.type === 'reading' ? [e.reading as RssiReading] : []));
  const send = (p: NativeWifiPoll) => {
    clock = p.polledAtMs + 3;
    fake.poll(p);
  };
  return { ...fake, provider, events, readings, send };
}

describe('Android Wi-Fi RSSI provider', () => {
  it('polls about once a second and treats the first poll as a baseline of unknown age', async () => {
    const { bridge, send, readings } = await setup();
    expect(bridge.started).toEqual([1_000]);
    send(poll(0));
    expect(readings()).toEqual([]);
  });

  it('emits a poll only when the link fields changed, over the window since the previous poll', async () => {
    const { send, readings } = await setup();
    send(poll(0));
    send(poll(1));
    send(poll(2));
    send(poll(3, { rssiDbm: -61 }));
    send(poll(4, { rssiDbm: -61, rxLinkSpeedMbps: 650 }));
    expect(readings().map((r) => [r.rssiDbm, r.collectedStartMs, r.collectedEndMs])).toEqual([
      [-61, T0 + 2_000, T0 + 3_000],
      [-61, T0 + 3_000, T0 + 4_000],
    ]);
  });

  it('normalizes network metadata and produces readings that pass validation', async () => {
    const { send, readings } = await setup();
    send(poll(0));
    send(poll(1, { rssiDbm: -58 }));
    const [reading] = readings();
    expect(reading).toMatchObject({
      id: 'reading-1',
      receivedAtMs: T0 + 1_003,
      source: { kind: 'android_wifi', providerId: 'android-wifi', deviceId: null, deviceModel: 'Google Pixel 8' },
      network: { ssid: 'Office', bssid: 'aa:bb:cc:dd:ee:ff', channel: 36, band: '5GHz' },
    });
    expect(validateReading(reading).ok).toBe(true);
  });

  it('keeps redacted names unknown when location access is missing', async () => {
    const { send, readings } = await setup({ hasLocationPermission: false });
    send(poll(0, { ssid: '<unknown ssid>', bssid: '02:00:00:00:00:00' }));
    send(poll(1, { ssid: '<unknown ssid>', bssid: '02:00:00:00:00:00', rssiDbm: -70 }));
    expect(readings()[0]!.network).toEqual({ ssid: null, bssid: null, channel: 36, band: '5GHz' });
  });

  it('reports a disconnect at once and needs a new baseline after reconnecting', async () => {
    const { send, readings, events } = await setup();
    send(poll(0));
    send(poll(1, { connected: false, rssiDbm: -127 }));
    send(poll(2, { connected: false, rssiDbm: -127 }));
    expect(events.filter((e) => e.type === 'state' && e.state === 'disconnected')).toHaveLength(1);
    send(poll(3, { rssiDbm: -65 }));
    expect(readings()).toEqual([]);
    send(poll(4, { rssiDbm: -66 }));
    expect(readings().map((r) => r.collectedStartMs)).toEqual([T0 + 3_000]);
    expect(events.filter((e) => e.type === 'state').map((e) => e.type === 'state' && e.state)).toEqual([
      'starting',
      'running',
      'disconnected',
      'running',
    ]);
  });

  it('stops polling and unsubscribes on stop', async () => {
    const { provider, bridge, hasListener } = await setup();
    await provider.stop();
    expect(bridge.stopped).toBe(1);
    expect(hasListener()).toBe(false);
  });

  it('reports availability with a reason', async () => {
    expect(await (await setup({ wifiEnabled: false })).provider.capabilities()).toMatchObject({ availability: 'disabled', reason: 'Wi-Fi is turned off.' });
    const caps = await (await setup({ hasLocationPermission: false, connected: false })).provider.capabilities();
    expect(caps.availability).toBe('available');
    expect(caps.reason).toMatch(/Not connected/);
    expect(caps.reason).toMatch(/location access/);
  });
});
