import { bandChannelFromFrequency, normalizeBssid, normalizeSsid } from '@/core';
import { parseByteCapMb, parseDimension, pinFromTouch, rssiView } from '@/modules/survey/presentation';
import { rssiSample } from './helpers/fixtures';

describe('bandChannelFromFrequency', () => {
  it.each([
    [2412, '2.4GHz', 1],
    [2472, '2.4GHz', 13],
    [2484, '2.4GHz', 14],
    [5180, '5GHz', 36],
    [5825, '5GHz', 165],
    [5935, '6GHz', 2],
    [5955, '6GHz', 1],
    [7115, '6GHz', 233],
  ])('%i MHz is %s channel %i', (mhz, band, channel) => {
    expect(bandChannelFromFrequency(mhz)).toEqual({ band, channel });
  });

  it.each([null, 0, -1, 2413, 3000, 5000, 2412.5])('%p is unknown', (mhz) => {
    expect(bandChannelFromFrequency(mhz)).toEqual({ band: null, channel: null });
  });
});

describe('network name normalization', () => {
  it('turns Android placeholders into null', () => {
    expect(normalizeSsid('"Office"')).toBe('Office');
    expect(normalizeSsid('<unknown ssid>')).toBeNull();
    expect(normalizeSsid('"<unknown ssid>"')).toBeNull();
    expect(normalizeBssid('02:00:00:00:00:00')).toBeNull();
    expect(normalizeBssid('AA:BB:CC:DD:EE:FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeBssid('garbage')).toBeNull();
  });
});

describe('survey presentation', () => {
  it('maps a tap on the board to metres and ignores taps outside it', () => {
    expect(pinFromTouch(150, 75, 30, 10, 10)).toEqual({ x: 5, y: 0, z: 2.5 });
    expect(pinFromTouch(301, 10, 30, 10, 10)).toBeNull();
    expect(pinFromTouch(10, 10, 0, 10, 10)).toBeNull();
  });

  it('uses the shared RSSI policy: -68 is Minimum but fails the default target', () => {
    expect(rssiView(rssiSample({ rssiDbm: -68 }), -67)).toMatchObject({ label: 'Minimum', meetsTarget: false });
    expect(rssiView(rssiSample({ rssiDbm: -67 }), -67)).toMatchObject({ label: 'Minimum', meetsTarget: true });
  });

  it('validates board size and data cap input', () => {
    expect(parseDimension('12,5')).toBe(12.5);
    expect(parseDimension('0')).toBeNull();
    expect(parseByteCapMb('20')).toBe(20);
    expect(parseByteCapMb('101')).toBeNull();
    expect(parseByteCapMb('2.5')).toBeNull();
  });
});
