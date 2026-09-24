import {
  type MeasurementCapabilities,
  type MeasurementConfig,
  type MeasurementEvent,
  type MeasurementProvider,
  type PerformanceReading,
  type PerformanceTestConfig,
} from '@/core';
import { normalizeEndpointUrl, parseEndpointInfo, PROTOCOL } from './protocol';
import { jitter, mbps, median, round } from './stats';

type Fetch = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface EndpointProviderDeps {
  readonly fetch: Fetch;
  /** Wall clock, epoch ms (sample timestamps). */
  readonly now: () => number;
  /** Monotonic clock in ms (durations). */
  readonly monotonic: () => number;
  readonly newId: () => string;
  /** True only when the active connection is Wi-Fi. Tests never run on cellular. */
  readonly isOnWifi: () => Promise<boolean>;
  readonly deviceModel: string | null;
  readonly pingCount?: number;
  readonly pingTimeoutMs?: number;
}

export const ENDPOINT_PROVIDER_ID = 'owned-endpoint';
/** Smallest transfer worth timing; below it the test reports throughput as not measured. */
const MIN_TRANSFER_BYTES = 64 * 1024;
const PAYLOAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Largest control response (info, ping) read before the test gives up on the endpoint. */
const MAX_CONTROL_BYTES = 4096;
/** Room kept in the byte budget for the upload acknowledgement. */
const UPLOAD_REPLY_BYTES = 256;

class TestError extends Error {}

/** Refuses oversized control responses by declared length, so a wrong URL cannot blow the byte cap. */
async function readControl(res: Awaited<ReturnType<Fetch>>, limit = MAX_CONTROL_BYTES): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > limit) throw new TestError('Not a Heat Mapper test endpoint (response too large)');
  const text = await res.text();
  if (text.length > limit) throw new TestError('Not a Heat Mapper test endpoint (response too large)');
  return text;
}

/** Random ASCII so uploads do not compress; one character is one byte on the wire. */
function payload(bytes: number): string {
  const block = Array.from({ length: 4096 }, () => PAYLOAD_ALPHABET[Math.floor(Math.random() * 64)]).join('');
  return block.repeat(Math.ceil(bytes / block.length)).slice(0, bytes);
}

/**
 * Performance tests against an endpoint the user runs (protocol hm-perf v1):
 * HTTP round trips for latency, jitter and loss, then a capped download and upload.
 * One `start` runs one test and emits one reading; bytes never exceed `maxBytes`.
 */
export function createEndpointPerformanceProvider(deps: EndpointProviderDeps): MeasurementProvider {
  const listeners = new Set<(event: MeasurementEvent) => void>();
  const emit = (event: MeasurementEvent) => listeners.forEach((l) => l(event));
  let controller: AbortController | null = null;
  const pingCount = deps.pingCount ?? 10;
  const pingTimeoutMs = deps.pingTimeoutMs ?? 1_000;

  async function request(url: string, signal: AbortSignal, init: Parameters<Fetch>[1] = {}, timeoutMs?: number) {
    const local = new AbortController();
    const abort = () => local.abort();
    signal.addEventListener('abort', abort);
    const timer = timeoutMs === undefined ? null : setTimeout(abort, timeoutMs);
    try {
      return await deps.fetch(url, { ...init, signal: local.signal, headers: { 'Cache-Control': 'no-store', ...init.headers } });
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }

  async function runTest(test: PerformanceTestConfig, signal: AbortSignal): Promise<PerformanceReading> {
    const base = normalizeEndpointUrl(test.endpointId);
    if (!base) throw new TestError('Endpoint must be an http:// or https:// address');
    const url = (path: string) => `${base}${PROTOCOL.prefix}${path}`;
    const startedAt = deps.now();
    let bytes = 0;

    const infoResponse = await request(url('/info'), signal, {}, 3_000);
    const infoText = await readControl(infoResponse);
    bytes += infoText.length;
    let info = null;
    try {
      info = infoResponse.ok ? parseEndpointInfo(JSON.parse(infoText)) : null;
    } catch {
      info = null;
    }
    if (!info) throw new TestError(`Not a Heat Mapper test endpoint (protocol ${PROTOCOL.name} v${PROTOCOL.version})`);

    const rtts: number[] = [];
    let lost = 0;
    for (let seq = 0; seq < pingCount; seq++) {
      const t0 = deps.monotonic();
      try {
        const res = await request(url(`/ping?seq=${seq}`), signal, {}, pingTimeoutMs);
        bytes += (await readControl(res)).length;
        if (res.ok) rtts.push(deps.monotonic() - t0);
        else lost += 1;
      } catch (error) {
        if (signal.aborted) throw error;
        lost += 1;
      }
    }
    if (rtts.length === 0) throw new TestError('The endpoint did not answer any round trip');

    const budget = Math.max(0, test.maxBytes - bytes - UPLOAD_REPLY_BYTES);
    const downloadBytes = Math.floor(budget / 2);
    const uploadBytes = budget - downloadBytes;

    let download: number | null = null;
    if (downloadBytes >= MIN_TRANSFER_BYTES) {
      const t0 = deps.monotonic();
      const res = await request(url(`/download?bytes=${downloadBytes}`), signal);
      const declared = Number(res.headers.get('content-length'));
      if (!res.ok) throw new TestError(`Download failed (HTTP ${res.status})`);
      if (Number.isFinite(declared) && declared > downloadBytes) throw new TestError('Endpoint offered more data than the byte cap');
      const body = await res.text();
      const elapsed = deps.monotonic() - t0;
      bytes += body.length;
      if (body.length > downloadBytes) throw new TestError('Endpoint sent more data than the byte cap');
      download = mbps(body.length, elapsed);
    }

    let upload: number | null = null;
    if (uploadBytes >= MIN_TRANSFER_BYTES) {
      const body = payload(uploadBytes);
      const t0 = deps.monotonic();
      const res = await request(url('/upload'), signal, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const reply = await readControl(res, UPLOAD_REPLY_BYTES);
      const elapsed = deps.monotonic() - t0;
      bytes += body.length + reply.length;
      let received: unknown = null;
      try {
        received = (JSON.parse(reply) as { received?: unknown }).received;
      } catch {
        received = null;
      }
      if (!res.ok || received !== uploadBytes) throw new TestError('Upload was not fully received by the endpoint');
      upload = mbps(uploadBytes, elapsed);
    }

    const endedAt = deps.now();
    return {
      kind: 'performance',
      id: deps.newId(),
      collectedStartMs: startedAt,
      collectedEndMs: Math.max(endedAt, startedAt),
      receivedAtMs: Math.max(deps.now(), endedAt),
      source: { kind: 'performance_endpoint', providerId: ENDPOINT_PROVIDER_ID, deviceId: null, deviceModel: deps.deviceModel },
      // The phone cannot read SSID/BSSID here without extra permissions; unknown stays null.
      network: { ssid: null, bssid: null, channel: null, band: null },
      scope: test.scope,
      endpointId: info.endpointId,
      metrics: {
        download_mbps: round(download, 2),
        upload_mbps: round(upload, 2),
        latency_ms: round(median(rtts), 1),
        jitter_ms: round(jitter(rtts), 1),
        packet_loss_pct: round((lost / pingCount) * 100, 1),
      },
      bytesTransferred: bytes,
    };
  }

  return {
    id: ENDPOINT_PROVIDER_ID,

    async capabilities(): Promise<MeasurementCapabilities> {
      return {
        mode: 'performance',
        sourceKind: 'performance_endpoint',
        availability: 'available',
        reason: 'Tests an endpoint you run (local network and internet separately), over HTTP, on Wi-Fi only.',
        metrics: ['download_mbps', 'upload_mbps', 'latency_ms', 'jitter_ms', 'packet_loss_pct'],
        bands: [],
        minIntervalMs: null,
        requiresStationary: true,
      };
    },

    /** Runs one test and resolves when it has finished, failed or been stopped. */
    async start(config: MeasurementConfig) {
      const test = config.performance;
      if (!test) {
        emit({ type: 'state', state: 'error', reason: 'No test configuration' });
        return;
      }
      if (controller) {
        emit({ type: 'state', state: 'error', reason: 'A test is already running' });
        return;
      }
      const own = new AbortController();
      controller = own;
      const deadline = setTimeout(() => own.abort(), test.maxDurationMs);
      emit({ type: 'state', state: 'starting', reason: null });
      try {
        if (!(await deps.isOnWifi())) throw new TestError('Connect to Wi-Fi. Performance tests never run on cellular data.');
        emit({ type: 'state', state: 'running', reason: null });
        const reading = await runTest(test, own.signal);
        emit({ type: 'reading', reading });
        emit({ type: 'state', state: 'stopped', reason: null });
      } catch (error) {
        const reason = own.signal.aborted
          ? 'Test stopped (time limit reached or cancelled)'
          : error instanceof TestError
            ? error.message
            : `Endpoint unreachable: ${error instanceof Error ? error.message : String(error)}`;
        emit({ type: 'state', state: 'error', reason });
      } finally {
        clearTimeout(deadline);
        controller = null;
      }
    },

    async stop() {
      controller?.abort();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
