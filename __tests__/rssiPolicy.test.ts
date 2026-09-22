import {
  classifyRssi,
  DEFAULT_RSSI_TARGET_DBM,
  formatBandRange,
  passesRssiTarget,
  RSSI_BANDS,
  resolveRssiTarget,
} from '@/core';

describe('RSSI policy', () => {
  it.each([
    [-20, 'excellent'], [-30, 'excellent'], [-49, 'excellent'],
    [-50, 'good'], [-59, 'good'],
    [-60, 'fair'], [-66, 'fair'],
    [-67, 'minimum'], [-68, 'minimum'], [-69, 'minimum'],
    [-70, 'unreliable'], [-79, 'unreliable'],
    [-80, 'weak'], [-89, 'weak'],
    [-90, 'very_weak'], [-110, 'very_weak'],
  ])('%i dBm is %s', (dbm, level) => {
    expect(classifyRssi(dbm).level).toBe(level);
  });

  it('puts interpolated values in the band whose lower bound they meet', () => {
    expect(classifyRssi(-49.5).level).toBe('good');
    expect(classifyRssi(-66.9).level).toBe('minimum');
  });

  it('bands are contiguous with no integer gaps or overlaps', () => {
    for (let i = 1; i < RSSI_BANDS.length; i++) {
      expect(RSSI_BANDS[i]!.maxDbm).toBe(RSSI_BANDS[i - 1]!.minDbm! - 1);
    }
  });

  it('-67 passes the default target; -68 and -69 are Minimum but fail', () => {
    expect(DEFAULT_RSSI_TARGET_DBM).toBe(-67);
    expect(passesRssiTarget(-67)).toBe(true);
    expect(passesRssiTarget(-68)).toBe(false);
    expect(passesRssiTarget(-69)).toBe(false);
  });

  it('applies project overrides and rejects invalid ones', () => {
    expect(resolveRssiTarget(null)).toBe(-67);
    expect(passesRssiTarget(-68, resolveRssiTarget(-70))).toBe(true);
    expect(() => resolveRssiTarget(-67.5)).toThrow(RangeError);
    expect(() => resolveRssiTarget(-10)).toThrow(RangeError);
  });

  it('rejects non-finite values instead of colouring them', () => {
    expect(() => classifyRssi(Number.NaN)).toThrow(RangeError);
    expect(() => passesRssiTarget(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('formats legend ranges', () => {
    expect(RSSI_BANDS.map(formatBandRange)).toEqual([
      '≥ -49', '-50 to -59', '-60 to -66', '-67 to -69', '-70 to -79', '-80 to -89', '≤ -90',
    ]);
  });
});
