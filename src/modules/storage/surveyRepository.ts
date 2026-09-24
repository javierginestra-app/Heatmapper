import {
  METRIC_UNITS,
  seriesKeyOf,
  validateSampleBatch,
  type BatchResult,
  type GapReason,
  type MeasurementMode,
  type MeasurementSourceKind,
  type PerformanceMetricKind,
  type PerformanceMetrics,
  type PositionSource,
  type RejectionReason,
  type Sample,
  type SampleQuery,
  type SessionStatus,
  type SurveyGap,
  type SurveyRepository,
  type SurveySeries,
  type SurveySession,
  type TestScope,
  type TrackingQuality,
  type WifiBand,
} from '@/core';
import { type SqlDriver, type SqlRow, type SqlValue } from './sqlDriver';

const str = (v: SqlRow[string] | undefined) => (v == null ? null : String(v));
const num = (v: SqlRow[string] | undefined) => (v == null ? null : Number(v));

const PERFORMANCE_METRICS = Object.keys(METRIC_UNITS).filter((k): k is PerformanceMetricKind => k !== 'rssi_dbm');

function toSession(r: SqlRow): SurveySession {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    locationId: String(r.location_id),
    mode: String(r.mode) as MeasurementMode,
    status: String(r.status) as SessionStatus,
    startedAtMs: Number(r.started_at_ms),
    endedAtMs: num(r.ended_at_ms),
  };
}

function toSeries(r: SqlRow): SurveySeries {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    seriesKey: String(r.series_key),
    kind: String(r.kind) as SurveySeries['kind'],
    sourceKind: String(r.source_kind) as MeasurementSourceKind,
    providerId: String(r.provider_id),
    deviceId: str(r.device_id),
    network: { ssid: str(r.ssid), bssid: str(r.bssid), channel: num(r.channel), band: str(r.band) as WifiBand | null },
    scope: str(r.scope) as TestScope | null,
    endpointId: str(r.endpoint_id),
    startedAtMs: Number(r.started_at_ms),
  };
}

function toGap(r: SqlRow): SurveyGap {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    seriesId: str(r.series_id),
    reason: String(r.reason) as GapReason,
    startedAtMs: Number(r.started_at_ms),
    endedAtMs: num(r.ended_at_ms),
  };
}

function toSample(r: SqlRow, metrics: ReadonlyMap<string, number>): Sample {
  const hasPosition = r.x_m != null;
  const base = {
    id: String(r.id),
    collectedStartMs: Number(r.collected_start_ms),
    collectedEndMs: Number(r.collected_end_ms),
    receivedAtMs: Number(r.received_at_ms),
    source: {
      kind: String(r.source_kind) as MeasurementSourceKind,
      providerId: String(r.provider_id),
      deviceId: str(r.device_id),
      deviceModel: str(r.device_model),
    },
    network: { ssid: str(r.ssid), bssid: str(r.bssid), channel: num(r.channel), band: str(r.band) as WifiBand | null },
    projectId: String(r.project_id),
    locationId: String(r.location_id),
    sessionId: String(r.session_id),
    seriesId: String(r.series_id),
    frameId: str(r.frame_id),
    position: hasPosition ? { x: Number(r.x_m), y: Number(r.y_m), z: Number(r.z_m) } : null,
    positionSource: str(r.position_source) as PositionSource | null,
    trackingQuality: String(r.tracking_quality) as TrackingQuality,
  };
  if (r.kind === 'rssi') return { ...base, kind: 'rssi', rssiDbm: Number(metrics.get('rssi_dbm')) };
  const values = Object.fromEntries(PERFORMANCE_METRICS.map((m) => [m, metrics.get(m) ?? null])) as PerformanceMetrics;
  return {
    ...base,
    kind: 'performance',
    scope: String(r.scope) as TestScope,
    endpointId: String(r.endpoint_id),
    metrics: values,
    bytesTransferred: Number(r.bytes_transferred),
  };
}

/** Metric rows for one sample: only measured values, each with its unit. */
function metricRows(sample: Sample): [string, number, string][] {
  if (sample.kind === 'rssi') return [['rssi_dbm', sample.rssiDbm, METRIC_UNITS.rssi_dbm]];
  return PERFORMANCE_METRICS.flatMap((m): [string, number, string][] => {
    const value = sample.metrics[m];
    return value === null ? [] : [[m, value, METRIC_UNITS[m]]];
  });
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

export function createSurveyRepository(db: SqlDriver): SurveyRepository {
  async function getSession(id: string): Promise<SurveySession | null> {
    const [row] = await db.execute('SELECT * FROM survey_sessions WHERE id = ?', [id]);
    return row ? toSession(row) : null;
  }

  async function recordGap(gap: SurveyGap): Promise<void> {
    if (gap.endedAtMs !== null && gap.endedAtMs < gap.startedAtMs) throw new RangeError('Gap ends before it starts');
    await db.execute(
      `INSERT INTO survey_gaps (id, session_id, series_id, reason, started_at_ms, ended_at_ms) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ended_at_ms = excluded.ended_at_ms`,
      [gap.id, gap.sessionId, gap.seriesId, gap.reason, gap.startedAtMs, gap.endedAtMs],
    );
  }

  /** Checks each validated sample against its stored session and series. */
  async function contextIssue(sample: Sample, cache: Map<string, SqlRow | null>): Promise<string | null> {
    const load = async (key: string, sql: string, id: string) => {
      if (!cache.has(key)) cache.set(key, (await db.execute(sql, [id]))[0] ?? null);
      return cache.get(key) ?? null;
    };
    const session = await load(`session:${sample.sessionId}`, 'SELECT * FROM survey_sessions WHERE id = ?', sample.sessionId);
    if (!session) return 'session not found';
    if (session.status !== 'recording') return `session is ${String(session.status)}`;
    if (session.project_id !== sample.projectId || session.location_id !== sample.locationId) {
      return 'project or location differs from the session';
    }
    const expectedMode: MeasurementMode = sample.kind === 'rssi' ? 'signal' : 'performance';
    if (session.mode !== expectedMode) return `${sample.kind} sample in a ${String(session.mode)} session`;
    const series = await load(`series:${sample.seriesId}`, 'SELECT * FROM survey_series WHERE id = ?', sample.seriesId);
    if (!series) return 'series not found';
    if (series.session_id !== sample.sessionId) return 'series belongs to another session';
    if (series.series_key !== seriesKeyOf(sample)) return 'source, network or metric set differs from the series';
    return null;
  }

  return {
    async saveSession(session) {
      await db.execute(
        `INSERT INTO survey_sessions (id, project_id, location_id, mode, status, started_at_ms, ended_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, ended_at_ms = excluded.ended_at_ms`,
        [session.id, session.projectId, session.locationId, session.mode, session.status, session.startedAtMs, session.endedAtMs],
      );
    },

    getSession,

    async saveSeries(series) {
      const { network } = series;
      await db.execute(
        `INSERT INTO survey_series (id, session_id, series_key, kind, source_kind, provider_id, device_id, ssid, bssid, channel, band, scope, endpoint_id, started_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          series.id,
          series.sessionId,
          series.seriesKey,
          series.kind,
          series.sourceKind,
          series.providerId,
          series.deviceId,
          network.ssid,
          network.bssid,
          network.channel,
          network.band,
          series.scope,
          series.endpointId,
          series.startedAtMs,
        ],
      );
    },

    async listSeries(sessionId) {
      return (await db.execute('SELECT * FROM survey_series WHERE session_id = ? ORDER BY started_at_ms, id', [sessionId])).map(
        toSeries,
      );
    },

    recordGap,

    async listGaps(sessionId) {
      return (await db.execute('SELECT * FROM survey_gaps WHERE session_id = ? ORDER BY started_at_ms, id', [sessionId])).map(toGap);
    },

    async appendSamples(inputs): Promise<BatchResult<Sample>> {
      const ids = inputs.flatMap((i) => {
        const id = typeof i === 'object' && i !== null ? (i as { id?: unknown }).id : undefined;
        return typeof id === 'string' && id.length > 0 ? [id] : [];
      });
      const stored =
        ids.length === 0 ? [] : await db.execute(`SELECT id FROM samples WHERE id IN (${placeholders(ids.length)})`, ids);
      const batch = validateSampleBatch(inputs, new Set(stored.map((r) => String(r.id))));

      const cache = new Map<string, SqlRow | null>();
      const accepted: Sample[] = [];
      const rejected: { id: string | null; reason: RejectionReason; detail: string }[] = [...batch.rejected];
      for (const sample of batch.accepted) {
        const issue = await contextIssue(sample, cache);
        if (issue) rejected.push({ id: sample.id, reason: 'context_mismatch', detail: issue });
        else accepted.push(sample);
      }

      await db.transaction(async () => {
        for (const s of accepted) {
          const perf = s.kind === 'performance' ? s : null;
          const row: SqlValue[] = [
            s.id,
            s.kind,
            s.projectId,
            s.locationId,
            s.sessionId,
            s.seriesId,
            s.frameId,
            s.collectedStartMs,
            s.collectedEndMs,
            s.receivedAtMs,
            s.position?.x ?? null,
            s.position?.y ?? null,
            s.position?.z ?? null,
            s.positionSource,
            s.trackingQuality,
            s.source.kind,
            s.source.providerId,
            s.source.deviceId,
            s.source.deviceModel,
            s.network.ssid,
            s.network.bssid,
            s.network.channel,
            s.network.band,
            perf?.scope ?? null,
            perf?.endpointId ?? null,
            perf?.bytesTransferred ?? null,
          ];
          await db.execute(
            `INSERT INTO samples (id, kind, project_id, location_id, session_id, series_id, frame_id, collected_start_ms,
               collected_end_ms, received_at_ms, x_m, y_m, z_m, position_source, tracking_quality, source_kind, provider_id,
               device_id, device_model, ssid, bssid, channel, band, scope, endpoint_id, bytes_transferred)
             VALUES (${placeholders(row.length)})`,
            row,
          );
          for (const [metric, value, unit] of metricRows(s)) {
            await db.execute('INSERT INTO sample_metrics (sample_id, metric, value, unit) VALUES (?, ?, ?, ?)', [
              s.id,
              metric,
              value,
              unit,
            ]);
          }
        }
      });
      return { accepted, rejected };
    },

    async listSamples(query: SampleQuery) {
      const filters: [string, SqlValue][] = [];
      if (query.sessionId !== undefined) filters.push(['session_id = ?', query.sessionId]);
      if (query.locationId !== undefined) filters.push(['location_id = ?', query.locationId]);
      if (query.kind !== undefined) filters.push(['kind = ?', query.kind]);
      const where = filters.map(([clause]) => clause);
      const params = filters.map(([, value]) => value);
      const filter = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await db.execute(`SELECT * FROM samples ${filter} ORDER BY collected_start_ms, id`, params);
      const metricRowsFound = await db.execute(
        `SELECT sample_id, metric, value FROM sample_metrics WHERE sample_id IN (SELECT id FROM samples ${filter})`,
        params,
      );
      const metrics = new Map<string, Map<string, number>>();
      for (const m of metricRowsFound) {
        const id = String(m.sample_id);
        if (!metrics.has(id)) metrics.set(id, new Map());
        metrics.get(id)!.set(String(m.metric), Number(m.value));
      }
      return rows.map((r) => toSample(r, metrics.get(String(r.id)) ?? new Map()));
    },

    async interruptOpenSessions(gapId) {
      const open = await db.execute(
        `SELECT s.id, COALESCE((SELECT MAX(collected_end_ms) FROM samples WHERE session_id = s.id), s.started_at_ms) AS last_ms
         FROM survey_sessions s WHERE s.status = 'recording'`,
      );
      await db.transaction(async () => {
        for (const row of open) {
          const sessionId = String(row.id);
          await db.execute("UPDATE survey_sessions SET status = 'paused' WHERE id = ?", [sessionId]);
          await recordGap({
            id: gapId(sessionId),
            sessionId,
            seriesId: null,
            reason: 'paused',
            startedAtMs: Number(row.last_ms),
            endedAtMs: null,
          });
        }
      });
      return open.length;
    },
  };
}
