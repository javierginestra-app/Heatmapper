import { type AddressInfo } from 'net';
import { type Server } from 'http';
import { validateReading, type MeasurementEvent, type PerformanceReading, type PerformanceTestConfig } from '@/core';
import { createEndpointPerformanceProvider, type EndpointProviderDeps } from '@/modules/performance/endpointProvider';
import { normalizeEndpointUrl } from '@/modules/performance/protocol';
import { jitter, mbps, median } from '@/modules/performance/stats';
import { sequentialIds } from './helpers/surveyFixtures';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPerfServer } = require('../tools/perf-endpoint/server');

let server: Server;
let base: string;

beforeAll(async () => {
  server = createPerfServer({ endpointId: 'test-lan' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function run(overrides: Partial<EndpointProviderDeps> = {}, test: Partial<PerformanceTestConfig> = {}) {
  const provider = createEndpointPerformanceProvider({
    fetch: (url, init) => fetch(url, init),
    now: Date.now,
    monotonic: () => performance.now(),
    newId: sequentialIds('perf'),
    isOnWifi: async () => true,
    deviceModel: 'Test phone',
    pingCount: 5,
    ...overrides,
  });
  const events: MeasurementEvent[] = [];
  provider.subscribe((e) => events.push(e));
  const done = provider.start({
    sessionId: 's1',
    targetBssid: null,
    performance: { endpointId: base, scope: 'local_network', maxBytes: 2_000_000, maxDurationMs: 10_000, ...test },
  });
  const reading = () => events.find((e) => e.type === 'reading') as { reading: PerformanceReading } | undefined;
  const lastState = () => [...events].reverse().find((e) => e.type === 'state') as Extract<MeasurementEvent, { type: 'state' }>;
  return { provider, events, done, reading, lastState };
}

describe('owned endpoint performance provider', () => {
  it('measures latency, jitter, loss, download and upload within the byte cap', async () => {
    const { done, reading, lastState } = await run();
    await done;
    const result = reading()?.reading;
    expect(result).toBeDefined();
    expect(validateReading(result).ok).toBe(true);
    expect(result).toMatchObject({ scope: 'local_network', endpointId: 'test-lan', network: { ssid: null, bssid: null } });
    expect(result!.source).toEqual({ kind: 'performance_endpoint', providerId: 'owned-endpoint', deviceId: null, deviceModel: 'Test phone' });
    expect(result!.bytesTransferred).toBeLessThanOrEqual(2_000_000);
    expect(result!.bytesTransferred).toBeGreaterThan(1_900_000);
    const m = result!.metrics;
    expect(m.download_mbps).toBeGreaterThan(0);
    expect(m.upload_mbps).toBeGreaterThan(0);
    expect(m.latency_ms).toBeGreaterThanOrEqual(0);
    expect(m.packet_loss_pct).toBe(0);
    expect(lastState().state).toBe('stopped');
  });

  it('skips throughput when the cap is too small to time, reporting it as not measured', async () => {
    const { done, reading } = await run({}, { maxBytes: 50_000 });
    await done;
    expect(reading()?.reading.metrics).toMatchObject({ download_mbps: null, upload_mbps: null });
    expect(reading()!.reading.bytesTransferred).toBeLessThanOrEqual(50_000);
  });

  it('never runs off Wi-Fi', async () => {
    const fetchSpy = jest.fn();
    const { done, reading, lastState } = await run({ isOnWifi: async () => false, fetch: fetchSpy });
    await done;
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reading()).toBeUndefined();
    expect(lastState()).toMatchObject({ state: 'error', reason: expect.stringMatching(/Wi-Fi/) });
  });

  it('refuses endpoints that do not speak the protocol', async () => {
    const { done, reading, lastState } = await run({}, { endpointId: `${base}/not-here` });
    await done;
    expect(reading()).toBeUndefined();
    expect(lastState().reason).toMatch(/Not a Heat Mapper test endpoint/);
  });

  it('aborts a download that declares more bytes than requested', async () => {
    const greedy: EndpointProviderDeps['fetch'] = async (url, init) => {
      if (url.includes('/download')) {
        return { ok: true, status: 200, headers: { get: () => '999999999' }, text: async () => 'x' };
      }
      return fetch(url, init);
    };
    const { done, reading, lastState } = await run({ fetch: greedy });
    await done;
    expect(reading()).toBeUndefined();
    expect(lastState().reason).toMatch(/more data than the byte cap/);
  });

  it('stops at the time limit', async () => {
    const hanging: EndpointProviderDeps['fetch'] = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const { done, reading, lastState } = await run({ fetch: hanging }, { maxDurationMs: 50 });
    await done;
    expect(reading()).toBeUndefined();
    expect(lastState().reason).toMatch(/Test stopped/);
  });
});

describe('performance helpers', () => {
  it('computes median, jitter and throughput', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(jitter([10, 12, 9])).toBe(2.5);
    expect(jitter([10])).toBeNull();
    expect(mbps(1_250_000, 1_000)).toBe(10);
    expect(mbps(1_000, 0)).toBeNull();
  });

  it('accepts only http(s) endpoint URLs', () => {
    expect(normalizeEndpointUrl(' http://192.168.1.10:8787/ ')).toBe('http://192.168.1.10:8787');
    expect(normalizeEndpointUrl('https://perf.example.com/base')).toBe('https://perf.example.com/base');
    expect(normalizeEndpointUrl('ftp://x')).toBeNull();
    expect(normalizeEndpointUrl('192.168.1.10')).toBeNull();
    expect(normalizeEndpointUrl('http://host/?q=1')).toBeNull();
  });
});
