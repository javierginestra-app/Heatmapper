import fs from 'fs';
import os from 'os';
import path from 'path';
import { seriesKeyOf, type SurveySeries, type SurveySession } from '@/core';
import { createSurveyRepository } from '@/modules/storage/surveyRepository';
import { performanceSample, rssiSample, T0 } from './helpers/fixtures';
import { openDatabaseAt } from './helpers/nodeSqliteDriver';
import { surveyDb } from './helpers/surveyFixtures';

const session = (overrides: Partial<SurveySession> = {}): SurveySession => ({
  id: 's1',
  projectId: 'p1',
  locationId: 'l1',
  mode: 'signal',
  status: 'recording',
  startedAtMs: T0 - 1_000,
  endedAtMs: null,
  ...overrides,
});

const seriesFor = (sample: ReturnType<typeof rssiSample> | ReturnType<typeof performanceSample>, id: string, sessionId = 's1'): SurveySeries => ({
  id,
  sessionId,
  seriesKey: seriesKeyOf(sample),
  kind: sample.kind,
  sourceKind: sample.source.kind,
  providerId: sample.source.providerId,
  deviceId: sample.source.deviceId,
  network: sample.network,
  scope: sample.kind === 'performance' ? sample.scope : null,
  endpointId: sample.kind === 'performance' ? sample.endpointId : null,
  startedAtMs: sample.collectedStartMs,
});

async function signalSetup() {
  const env = await surveyDb();
  await env.surveys.saveSession(session());
  await env.surveys.saveSeries(seriesFor(rssiSample(), 'series-1'));
  return env;
}

describe('SurveyRepository sessions, series and gaps', () => {
  it('upserts sessions and keeps their identity fields', async () => {
    const { surveys } = await surveyDb();
    await surveys.saveSession(session());
    await surveys.saveSession(session({ status: 'completed', endedAtMs: T0 + 5_000, mode: 'performance' }));
    expect(await surveys.getSession('s1')).toEqual(session({ status: 'completed', endedAtMs: T0 + 5_000 }));
    expect(await surveys.getSession('missing')).toBeNull();
  });

  it('round-trips series with nullable network metadata', async () => {
    const { surveys } = await surveyDb();
    await surveys.saveSession(session({ mode: 'performance' }));
    const series = seriesFor(performanceSample(), 'series-2');
    await surveys.saveSeries(series);
    expect(await surveys.listSeries('s1')).toEqual([series]);
  });

  it('saves a gap open and closes it by saving it again', async () => {
    const { surveys } = await surveyDb();
    await surveys.saveSession(session());
    const gap = { id: 'g1', sessionId: 's1', seriesId: null, reason: 'paused' as const, startedAtMs: T0, endedAtMs: null };
    await surveys.recordGap(gap);
    await surveys.recordGap({ ...gap, endedAtMs: T0 + 3_000 });
    expect(await surveys.listGaps('s1')).toEqual([{ ...gap, endedAtMs: T0 + 3_000 }]);
    await expect(surveys.recordGap({ ...gap, endedAtMs: T0 - 1 })).rejects.toThrow(RangeError);
  });
});

describe('SurveyRepository.appendSamples', () => {
  it('stores raw RSSI with its unit and reads the sample back unchanged', async () => {
    const { db, surveys } = await signalSetup();
    const sample = rssiSample({ rssiDbm: -68 });
    const result = await surveys.appendSamples([sample]);
    expect(result).toEqual({ accepted: [sample], rejected: [] });
    expect(await db.execute('SELECT metric, value, unit FROM sample_metrics')).toEqual([{ metric: 'rssi_dbm', value: -68, unit: 'dBm' }]);
    expect(await surveys.listSamples({ sessionId: 's1' })).toEqual([sample]);
  });

  it('stores only measured performance metrics and reads unmeasured ones back as null', async () => {
    const { db, surveys } = await surveyDb();
    await surveys.saveSession(session({ mode: 'performance' }));
    const sample = performanceSample({ position: { x: 1, y: 0, z: 2 }, positionSource: 'manual_pin', trackingQuality: 'manual' });
    await surveys.saveSeries(seriesFor(sample, 'series-2'));
    expect((await surveys.appendSamples([sample])).accepted).toHaveLength(1);
    const rows = await db.execute('SELECT metric, unit FROM sample_metrics ORDER BY metric');
    expect(rows.map((r) => r.metric)).toEqual(['download_mbps', 'jitter_ms', 'latency_ms', 'upload_mbps']);
    expect(rows.find((r) => r.metric === 'download_mbps')?.unit).toBe('Mbps');
    expect(await surveys.listSamples({ kind: 'performance' })).toEqual([sample]);
  });

  it('rejects ids already stored and ids repeated within a batch', async () => {
    const { surveys } = await signalSetup();
    await surveys.appendSamples([rssiSample({ id: 'a' })]);
    const result = await surveys.appendSamples([
      rssiSample({ id: 'a', collectedStartMs: T0 + 1_000, collectedEndMs: T0 + 1_000, receivedAtMs: T0 + 1_010 }),
      rssiSample({ id: 'b' }),
      rssiSample({ id: 'b' }),
    ]);
    expect(result.accepted.map((s) => s.id)).toEqual(['b']);
    expect(result.rejected.map((r) => [r.id, r.reason])).toEqual([
      ['a', 'duplicate_id'],
      ['b', 'duplicate_id'],
    ]);
  });

  it('rejects stale and invalid readings without storing anything', async () => {
    const { surveys } = await signalSetup();
    const result = await surveys.appendSamples([
      rssiSample({ id: 'stale', receivedAtMs: T0 + 2_001 }),
      rssiSample({ id: 'zero', rssiDbm: 0 }),
      { nonsense: true },
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((r) => r.reason)).toEqual(['stale', 'invalid_value', 'invalid_payload']);
    expect(await surveys.listSamples({})).toEqual([]);
  });

  it('rejects samples that do not match their session or series', async () => {
    const { surveys } = await signalSetup();
    await surveys.saveSession(session({ id: 's2' }));
    await surveys.saveSeries(seriesFor(rssiSample(), 'other-series', 's2'));
    const result = await surveys.appendSamples([
      rssiSample({ id: 'roamed', network: { ssid: 'Office', bssid: '11:22:33:44:55:66', channel: 1, band: '2.4GHz' } }),
      rssiSample({ id: 'foreign', seriesId: 'other-series' }),
      rssiSample({ id: 'no-series', seriesId: 'missing' }),
      rssiSample({ id: 'wrong-room', locationId: 'elsewhere' }),
      performanceSample({ id: 'wrong-mode', seriesId: 'series-1' }),
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((r) => [r.id, r.reason, r.detail])).toEqual([
      ['roamed', 'context_mismatch', 'source, network or metric set differs from the series'],
      ['foreign', 'context_mismatch', 'series belongs to another session'],
      ['no-series', 'context_mismatch', 'series not found'],
      ['wrong-room', 'context_mismatch', 'project or location differs from the session'],
      ['wrong-mode', 'context_mismatch', 'performance sample in a signal session'],
    ]);
  });

  it('rejects samples while the session is paused or completed', async () => {
    const { surveys } = await signalSetup();
    await surveys.saveSession(session({ status: 'paused' }));
    expect((await surveys.appendSamples([rssiSample()])).rejected[0]?.detail).toBe('session is paused');
    await surveys.saveSession(session({ status: 'completed', endedAtMs: T0 }));
    expect((await surveys.appendSamples([rssiSample()])).rejected[0]?.detail).toBe('session is completed');
  });

  it('filters by session, location and kind, oldest first', async () => {
    const { surveys } = await signalSetup();
    await surveys.appendSamples([
      rssiSample({ id: 'late', collectedStartMs: T0 + 2_000, collectedEndMs: T0 + 2_000, receivedAtMs: T0 + 2_010 }),
      rssiSample({ id: 'early' }),
    ]);
    expect((await surveys.listSamples({ sessionId: 's1', locationId: 'l1', kind: 'rssi' })).map((s) => s.id)).toEqual(['early', 'late']);
    expect(await surveys.listSamples({ kind: 'performance' })).toEqual([]);
  });
});

describe('SurveyRepository crash recovery', () => {
  it('pauses sessions left recording and opens a gap from their last sample', async () => {
    const { surveys } = await signalSetup();
    await surveys.appendSamples([rssiSample({ collectedStartMs: T0, collectedEndMs: T0 + 500, receivedAtMs: T0 + 510 })]);
    await surveys.saveSession(session({ id: 'done', status: 'completed', endedAtMs: T0 }));
    expect(await surveys.interruptOpenSessions((id) => `gap-${id}`)).toBe(1);
    expect((await surveys.getSession('s1'))?.status).toBe('paused');
    expect((await surveys.getSession('done'))?.status).toBe('completed');
    expect(await surveys.listGaps('s1')).toEqual([
      { id: 'gap-s1', sessionId: 's1', seriesId: null, reason: 'paused', startedAtMs: T0 + 500, endedAtMs: null },
    ]);
    expect(await surveys.interruptOpenSessions((id) => `again-${id}`)).toBe(0);
  });

  it('keeps samples, series and gaps after the database is closed and reopened', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hm-survey-')), 'test.db');
    const first = await surveyDb(openDatabaseAt(file));
    await first.surveys.saveSession(session());
    await first.surveys.saveSeries(seriesFor(rssiSample(), 'series-1'));
    await first.surveys.appendSamples([rssiSample()]);
    await first.db.close();

    const reopened = openDatabaseAt(file);
    const surveys = createSurveyRepository(reopened);
    expect(await surveys.listSamples({ sessionId: 's1' })).toEqual([rssiSample()]);
    expect(await surveys.listSeries('s1')).toHaveLength(1);
    await reopened.close();
  });
});
