import { seriesKeyOf, validateReading, validateSample, validateSampleBatch } from '@/core';
import { performanceSample, rssiSample, T0 } from './helpers/fixtures';

describe('sample validation', () => {
  it('accepts well-formed RSSI and performance samples', () => {
    expect(validateSample(rssiSample()).ok).toBe(true);
    expect(validateSample(performanceSample()).ok).toBe(true);
  });

  it.each([
    ['non-integer RSSI', { rssiDbm: -55.5 }, 'invalid_value'],
    ['RSSI of 0 (driver sentinel)', { rssiDbm: 0 }, 'invalid_value'],
    ['RSSI below -120', { rssiDbm: -127 }, 'invalid_value'],
    ['malformed BSSID', { network: { ssid: 'x', bssid: 'nope', channel: 1, band: '2.4GHz' } }, 'invalid_payload'],
    ['unknown band', { network: { ssid: 'x', bssid: null, channel: 1, band: '60GHz' } }, 'invalid_payload'],
    ['position without source', { positionSource: null }, 'invalid_payload'],
    ['stale reading', { receivedAtMs: T0 + 5_000 }, 'stale'],
    ['collected after receipt', { collectedEndMs: T0 + 2_000, receivedAtMs: T0 + 20 }, 'future_timestamp'],
  ])('rejects %s', (_label, overrides, reason) => {
    const result = validateSample({ ...rssiSample(), ...overrides });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it('rejects non-object and unknown-kind payloads', () => {
    expect(validateReading(null)).toMatchObject({ ok: false, reason: 'invalid_payload' });
    expect(validateReading({ ...rssiSample(), kind: 'bluetooth' })).toMatchObject({ ok: false, reason: 'invalid_payload' });
  });

  it('keeps unmeasured performance metrics null and rejects impossible ones', () => {
    const nothing = performanceSample({
      metrics: { download_mbps: null, upload_mbps: null, latency_ms: null, jitter_ms: null, packet_loss_pct: null },
    });
    expect(validateSample(nothing)).toMatchObject({ ok: false, reason: 'invalid_value' });
    const loss = performanceSample({ metrics: { ...performanceSample().metrics, packet_loss_pct: 140 } });
    expect(validateSample(loss)).toMatchObject({ ok: false, reason: 'invalid_value' });
  });

  it('rejects ids already stored or repeated within a batch', () => {
    const result = validateSampleBatch(
      [rssiSample({ id: 'a' }), rssiSample({ id: 'a' }), rssiSample({ id: 'old' })],
      new Set(['old']),
    );
    expect(result.accepted.map((s) => s.id)).toEqual(['a']);
    expect(result.rejected.map((r) => r.reason)).toEqual(['duplicate_id', 'duplicate_id']);
  });
});

describe('series separation', () => {
  it('starts a new series when source, network or metric set changes', () => {
    const base = seriesKeyOf(rssiSample());
    expect(seriesKeyOf(rssiSample({ id: 'other', rssiDbm: -70 }))).toBe(base);
    expect(seriesKeyOf(rssiSample({ source: { ...rssiSample().source, kind: 'external_probe' } }))).not.toBe(base);
    expect(seriesKeyOf(rssiSample({ network: { ...rssiSample().network, bssid: '11:22:33:44:55:66' } }))).not.toBe(base);
    expect(seriesKeyOf(performanceSample())).not.toBe(seriesKeyOf(performanceSample({ scope: 'internet' })));
  });
});
