import {
  METRIC_UNITS,
  WIFI_BANDS,
  type MeasurementSource,
  type NetworkInfo,
  type PerformanceMetricKind,
} from './measurement';
import { type Reading, type Sample, type SampleContext } from './samples';

export type RejectionReason =
  | 'invalid_payload'
  | 'invalid_value'
  | 'stale'
  | 'future_timestamp'
  | 'duplicate_id';

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: RejectionReason; readonly detail: string };

export interface FreshnessPolicy {
  /** A reading older than this when it reached the phone is stale. */
  readonly maxAgeMs: number;
  /** Tolerated clock disagreement between a probe and the phone. */
  readonly maxClockSkewMs: number;
}

export const DEFAULT_FRESHNESS: FreshnessPolicy = { maxAgeMs: 2_000, maxClockSkewMs: 500 };

/** Radios report integer dBm; 0 and below -120 are driver sentinels, not measurements. */
export const RSSI_VALID_RANGE_DBM = { min: -120, max: -1 } as const;

const BSSID_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
const PERFORMANCE_METRICS = Object.keys(METRIC_UNITS).filter(
  (k): k is PerformanceMetricKind => k !== 'rssi_dbm',
);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNullableStr = (v: unknown): v is string | null => v === null || isStr(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isTimestamp = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

function fail<T>(reason: RejectionReason, detail: string): Validated<T> {
  return { ok: false, reason, detail };
}

function parseSource(v: unknown): MeasurementSource | null {
  if (!isObj(v)) return null;
  const kinds = ['android_wifi', 'external_probe', 'performance_endpoint'];
  if (!kinds.includes(v.kind as string) || !isStr(v.providerId)) return null;
  if (!isNullableStr(v.deviceId) || !isNullableStr(v.deviceModel)) return null;
  return v as unknown as MeasurementSource;
}

function parseNetwork(v: unknown): NetworkInfo | null {
  if (!isObj(v)) return null;
  if (!isNullableStr(v.ssid)) return null;
  if (!(v.bssid === null || (typeof v.bssid === 'string' && BSSID_RE.test(v.bssid)))) return null;
  if (!(v.channel === null || (Number.isSafeInteger(v.channel) && (v.channel as number) > 0))) return null;
  if (!(v.band === null || WIFI_BANDS.includes(v.band as never))) return null;
  return v as unknown as NetworkInfo;
}

/** Validates an untrusted provider payload (native bridge, BLE, network test). */
export function validateReading(input: unknown, policy: FreshnessPolicy = DEFAULT_FRESHNESS): Validated<Reading> {
  if (!isObj(input)) return fail('invalid_payload', 'reading is not an object');
  const { id, kind, collectedStartMs: start, collectedEndMs: end, receivedAtMs: received } = input;
  if (!isStr(id)) return fail('invalid_payload', 'missing id');
  if (!isTimestamp(start) || !isTimestamp(end) || !isTimestamp(received)) {
    return fail('invalid_payload', 'timestamps must be positive integer epoch ms');
  }
  if (end < start) return fail('invalid_value', 'collection ends before it starts');
  if (end > received + policy.maxClockSkewMs) return fail('future_timestamp', 'collected after it was received');
  if (received - end > policy.maxAgeMs) return fail('stale', `reading was ${received - end} ms old on receipt`);
  if (!parseSource(input.source)) return fail('invalid_payload', 'invalid source');
  if (!parseNetwork(input.network)) return fail('invalid_payload', 'invalid network metadata');

  if (kind === 'rssi') {
    const dbm = input.rssiDbm;
    if (!Number.isInteger(dbm)) return fail('invalid_value', 'RSSI must be an integer dBm');
    const n = dbm as number;
    if (n < RSSI_VALID_RANGE_DBM.min || n > RSSI_VALID_RANGE_DBM.max) {
      return fail('invalid_value', `RSSI ${n} dBm is outside ${RSSI_VALID_RANGE_DBM.min}..${RSSI_VALID_RANGE_DBM.max}`);
    }
    return { ok: true, value: input as unknown as Reading };
  }

  if (kind === 'performance') {
    if (input.scope !== 'local_network' && input.scope !== 'internet') return fail('invalid_payload', 'invalid scope');
    if (!isStr(input.endpointId)) return fail('invalid_payload', 'missing endpointId');
    if (!Number.isSafeInteger(input.bytesTransferred) || (input.bytesTransferred as number) < 0) {
      return fail('invalid_value', 'bytesTransferred must be a non-negative integer');
    }
    const metrics = input.metrics;
    if (!isObj(metrics)) return fail('invalid_payload', 'missing metrics');
    let measured = 0;
    for (const key of PERFORMANCE_METRICS) {
      const value = metrics[key];
      if (value === null) continue;
      if (!isFiniteNum(value) || value < 0) return fail('invalid_value', `${key} must be a non-negative number or null`);
      if (key === 'packet_loss_pct' && value > 100) return fail('invalid_value', 'packet loss exceeds 100%');
      measured += 1;
    }
    if (measured === 0) return fail('invalid_value', 'performance reading has no measured metric');
    return { ok: true, value: input as unknown as Reading };
  }

  return fail('invalid_payload', 'unknown reading kind');
}

function validateContext(input: Obj): string | null {
  for (const key of ['projectId', 'locationId', 'sessionId', 'seriesId'] as const) {
    if (!isStr(input[key])) return `missing ${key}`;
  }
  if (!isNullableStr(input.frameId)) return 'invalid frameId';
  const { position, positionSource, trackingQuality } = input as Partial<Record<keyof SampleContext, unknown>>;
  if (!['normal', 'limited', 'not_available', 'manual'].includes(trackingQuality as string)) return 'invalid trackingQuality';
  if (position === null) return positionSource === null ? null : 'positionSource without position';
  if (!isObj(position) || ![position.x, position.y, position.z].every(isFiniteNum)) return 'invalid position';
  if (positionSource !== 'tracking' && positionSource !== 'manual_pin') return 'position without positionSource';
  return null;
}

/** Validates a full sample before storage (reading payload plus survey context). */
export function validateSample(input: unknown, policy: FreshnessPolicy = DEFAULT_FRESHNESS): Validated<Sample> {
  const reading = validateReading(input, policy);
  if (!reading.ok) return reading;
  const contextError = validateContext(input as Obj);
  if (contextError) return fail('invalid_payload', contextError);
  return { ok: true, value: { ...(input as Sample), ...reading.value } as Sample };
}

export interface BatchResult<T> {
  readonly accepted: readonly T[];
  readonly rejected: readonly { readonly id: string | null; readonly reason: RejectionReason; readonly detail: string }[];
}

/** Validates a batch, rejecting ids already stored (`seenIds`) or repeated within the batch. */
export function validateSampleBatch(
  inputs: readonly unknown[],
  seenIds: ReadonlySet<string>,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS,
): BatchResult<Sample> {
  const accepted: Sample[] = [];
  const rejected: { id: string | null; reason: RejectionReason; detail: string }[] = [];
  const ids = new Set(seenIds);
  for (const input of inputs) {
    const id = isObj(input) && isStr(input.id) ? input.id : null;
    if (id !== null && ids.has(id)) {
      rejected.push({ id, reason: 'duplicate_id', detail: 'sample id already recorded' });
      continue;
    }
    const result = validateSample(input, policy);
    if (!result.ok) {
      rejected.push({ id, reason: result.reason, detail: result.detail });
      continue;
    }
    ids.add(result.value.id);
    accepted.push(result.value);
  }
  return { accepted, rejected };
}
