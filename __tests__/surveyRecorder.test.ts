import { type PerformanceReading, type RssiReading } from '@/core';
import { manualFrameId, readingRate, SurveyRecorder } from '@/modules/survey/recorder';
import { T0 } from './helpers/fixtures';
import { FakeProvider } from './helpers/fakeProvider';
import { sequentialIds, surveyDb } from './helpers/surveyFixtures';

const OFFICE = { ssid: 'Office', bssid: 'aa:bb:cc:dd:ee:ff', channel: 36, band: '5GHz' } as const;

function rssi(n: number, overrides: Partial<RssiReading> = {}): RssiReading {
  const at = T0 + n * 1_000;
  return {
    kind: 'rssi',
    id: `r${n}`,
    rssiDbm: -50 - n,
    collectedStartMs: at - 1_000,
    collectedEndMs: at,
    receivedAtMs: at + 5,
    source: { kind: 'android_wifi', providerId: 'android-wifi', deviceId: null, deviceModel: 'Pixel' },
    network: OFFICE,
    ...overrides,
  };
}

function perf(scope: PerformanceReading['scope'], id: string): PerformanceReading {
  return {
    kind: 'performance',
    id,
    scope,
    endpointId: scope === 'internet' ? 'cloud' : 'lan',
    metrics: { download_mbps: 300, upload_mbps: 100, latency_ms: 3, jitter_ms: 0.4, packet_loss_pct: 0 },
    bytesTransferred: 1_000_000,
    collectedStartMs: T0,
    collectedEndMs: T0 + 4_000,
    receivedAtMs: T0 + 4_001,
    source: { kind: 'performance_endpoint', providerId: 'owned-endpoint', deviceId: null, deviceModel: null },
    network: { ssid: null, bssid: null, channel: null, band: null },
  };
}

async function setup(mode: 'signal' | 'performance' = 'signal') {
  const env = await surveyDb();
  const provider = new FakeProvider();
  let clock = T0;
  const deps = { surveys: env.surveys, provider, newId: sequentialIds(), now: () => clock, staleAfterMs: 5_000 };
  const recorder = await SurveyRecorder.start(deps, { projectId: 'p1', locationId: 'l1', mode });
  const settle = () => recorder.setPin(recorder.current.pin); // queued no-op: waits for earlier events
  return { ...env, provider, recorder, settle, setClock: (ms: number) => (clock = ms) };
}

describe('SurveyRecorder (signal mode)', () => {
  it('starts a recording session and the provider, and stores readings with survey context', async () => {
    const { provider, recorder, surveys, settle } = await setup();
    expect(provider.starts).toHaveLength(1);
    expect((await surveys.getSession(recorder.current.sessionId))?.status).toBe('recording');

    provider.emit({ type: 'reading', reading: rssi(1) });
    await settle();
    const [sample] = await surveys.listSamples({ sessionId: recorder.current.sessionId });
    expect(sample).toMatchObject({ id: 'r1', rssiDbm: -51, position: null, positionSource: null, trackingQuality: 'not_available', frameId: null });
    expect(recorder.current).toMatchObject({ accepted: 1, rejected: 0, seriesCount: 1 });
    expect(recorder.current.lastReading?.id).toBe('r1');
  });

  it('tags readings with the marked point until it is cleared', async () => {
    const { provider, recorder, surveys, settle } = await setup();
    await recorder.setPin({ x: 2, y: 0, z: 3.5 });
    provider.emit({ type: 'reading', reading: rssi(1) });
    await recorder.setPin(null);
    provider.emit({ type: 'reading', reading: rssi(2) });
    await settle();
    const samples = await surveys.listSamples({});
    expect(samples[0]).toMatchObject({ position: { x: 2, y: 0, z: 3.5 }, positionSource: 'manual_pin', trackingQuality: 'manual', frameId: manualFrameId('l1') });
    expect(samples[1]).toMatchObject({ position: null, positionSource: null });
    expect(recorder.current.placed.map((p) => p.id)).toEqual(['r1']);
  });

  it('starts a new series when the access point changes', async () => {
    const { provider, recorder, surveys, settle } = await setup();
    provider.emit({ type: 'reading', reading: rssi(1) });
    provider.emit({ type: 'reading', reading: rssi(2, { network: { ...OFFICE, bssid: '11:22:33:44:55:66' } }) });
    provider.emit({ type: 'reading', reading: rssi(3) });
    await settle();
    const series = await surveys.listSeries(recorder.current.sessionId);
    expect(series.map((s) => s.network.bssid)).toEqual(['aa:bb:cc:dd:ee:ff', '11:22:33:44:55:66']);
    const samples = await surveys.listSamples({});
    expect(samples[0]!.seriesId).toBe(samples[2]!.seriesId);
    expect(samples[1]!.seriesId).not.toBe(samples[0]!.seriesId);
  });

  it('rejects stale, duplicate and invalid readings without storing them', async () => {
    const { provider, recorder, surveys, settle } = await setup();
    provider.emit({ type: 'reading', reading: rssi(1) });
    provider.emit({ type: 'reading', reading: rssi(1) });
    provider.emit({ type: 'reading', reading: rssi(2, { receivedAtMs: T0 + 2_000 + 2_500 }) });
    provider.emit({ type: 'reading', reading: rssi(3, { rssiDbm: -127 }) });
    await settle();
    expect(await surveys.listSamples({})).toHaveLength(1);
    expect(recorder.current).toMatchObject({ accepted: 1, rejected: 3 });
  });

  it('pause stops the source and records a gap; readings while paused are not stored; resume restarts', async () => {
    const { provider, recorder, surveys, setClock } = await setup();
    setClock(T0 + 10_000);
    await recorder.pause();
    expect(provider.stops).toBe(1);
    expect((await surveys.getSession(recorder.current.sessionId))?.status).toBe('paused');
    provider.emit({ type: 'reading', reading: rssi(11) });
    setClock(T0 + 20_000);
    await recorder.resume();
    expect(provider.starts).toHaveLength(2);
    expect(await surveys.listSamples({})).toEqual([]);
    expect(recorder.current.rejected).toBe(1);
    expect(await surveys.listGaps(recorder.current.sessionId)).toMatchObject([
      { reason: 'paused', startedAtMs: T0 + 10_000, endedAtMs: T0 + 20_000 },
    ]);
  });

  it('records a disconnect gap at once and closes it with the next fresh reading', async () => {
    const { provider, recorder, surveys, settle, setClock } = await setup();
    provider.emit({ type: 'reading', reading: rssi(1) });
    await settle();
    setClock(T0 + 3_000);
    provider.emit({ type: 'state', state: 'disconnected', reason: 'Not connected' });
    await settle();
    expect(recorder.current.openGap).toBe('source_disconnected');
    provider.emit({ type: 'reading', reading: rssi(8) });
    await settle();
    const [gap] = await surveys.listGaps(recorder.current.sessionId);
    expect(gap).toMatchObject({ reason: 'source_disconnected', startedAtMs: T0 + 3_000, endedAtMs: T0 + 7_000 });
    expect(gap!.seriesId).not.toBeNull();
    expect(recorder.current.openGap).toBeNull();
  });

  it('opens a stale-data gap when no fresh reading arrives in time', async () => {
    const { provider, recorder, surveys, settle, setClock } = await setup();
    provider.emit({ type: 'reading', reading: rssi(1) });
    await settle();
    setClock(T0 + 1_005 + 4_000);
    await recorder.checkFreshness();
    expect(recorder.current.openGap).toBeNull();
    setClock(T0 + 1_005 + 6_000);
    await recorder.checkFreshness();
    await recorder.checkFreshness();
    expect(await surveys.listGaps(recorder.current.sessionId)).toMatchObject([{ reason: 'stale_data', startedAtMs: T0 + 1_005, endedAtMs: null }]);
  });

  it('finish completes the session, closes gaps and ignores later events', async () => {
    const { provider, recorder, surveys, settle, setClock } = await setup();
    await recorder.pause();
    setClock(T0 + 9_000);
    await recorder.finish();
    expect(await surveys.getSession(recorder.current.sessionId)).toMatchObject({ status: 'completed', endedAtMs: T0 + 9_000 });
    expect((await surveys.listGaps(recorder.current.sessionId))[0]?.endedAtMs).toBe(T0 + 9_000);
    expect(provider.listenerCount).toBe(0);
    provider.emit({ type: 'reading', reading: rssi(20) });
    await settle();
    expect(await surveys.listSamples({})).toEqual([]);
  });
});

describe('SurveyRecorder (performance mode)', () => {
  it('does not start the source until a test is requested, and requires a marked point', async () => {
    const { provider, recorder } = await setup('performance');
    expect(provider.starts).toEqual([]);
    await expect(
      recorder.runPerformanceTest({ endpointId: 'http://lan', scope: 'local_network', maxBytes: 1e6, maxDurationMs: 1e4 }),
    ).rejects.toThrow(/Mark your position/);
  });

  it('stores local and internet results in separate series at the marked point', async () => {
    const { provider, recorder, surveys } = await setup('performance');
    provider.onStart = (config) => provider.emit({ type: 'reading', reading: perf(config.performance!.scope, `t-${config.performance!.scope}`) });
    await recorder.setPin({ x: 4, y: 0, z: 1 });
    await recorder.runPerformanceTest({ endpointId: 'http://lan', scope: 'local_network', maxBytes: 1e6, maxDurationMs: 1e4 });
    await recorder.runPerformanceTest({ endpointId: 'https://cloud', scope: 'internet', maxBytes: 1e6, maxDurationMs: 1e4 });
    expect(provider.starts.map((c) => c.performance?.maxBytes)).toEqual([1e6, 1e6]);
    const samples = await surveys.listSamples({ kind: 'performance' });
    const byScope = samples.map((s) => [s.kind === 'performance' && s.scope, s.position]).sort();
    expect(byScope).toEqual([
      ['internet', { x: 4, y: 0, z: 1 }],
      ['local_network', { x: 4, y: 0, z: 1 }],
    ]);
    expect(new Set(samples.map((s) => s.seriesId)).size).toBe(2);
    expect(Object.keys(recorder.current.latestByScope).sort()).toEqual(['internet', 'local_network']);
    expect(recorder.current.testRunning).toBeNull();
  });

  it('discards a result when the point moves during the test', async () => {
    const { provider, recorder, surveys } = await setup('performance');
    provider.onStart = async () => {
      await recorder.setPin({ x: 9, y: 0, z: 9 });
      provider.emit({ type: 'reading', reading: perf('local_network', 'moved') });
    };
    await recorder.setPin({ x: 1, y: 0, z: 1 });
    await recorder.runPerformanceTest({ endpointId: 'http://lan', scope: 'local_network', maxBytes: 1e6, maxDurationMs: 1e4 });
    expect(await surveys.listSamples({})).toEqual([]);
    expect(recorder.current.lastRejection).toMatch(/Position changed/);
  });

  it('does not record a provider error during a test as a gap', async () => {
    const { provider, recorder } = await setup('performance');
    provider.onStart = () => provider.emit({ type: 'state', state: 'error', reason: 'Connect to Wi-Fi.' });
    await recorder.setPin({ x: 1, y: 0, z: 1 });
    await recorder.runPerformanceTest({ endpointId: 'http://lan', scope: 'local_network', maxBytes: 1e6, maxDurationMs: 1e4 });
    expect(recorder.current).toMatchObject({ providerState: 'error', providerReason: 'Connect to Wi-Fi.', openGap: null, gapCount: 0 });
  });
});

describe('readingRate', () => {
  it('counts readings per second over the window', () => {
    expect(readingRate([T0 - 11_000, T0 - 5_000, T0 - 1_000, T0], T0)).toBeCloseTo(0.3);
    expect(readingRate([], T0)).toBe(0);
  });
});
