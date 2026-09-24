import { DEFAULT_SETTINGS, Registry } from '@/core';
import { detectCapabilities } from '@/modules/capabilities/detect';

const byId = (list: Awaited<ReturnType<typeof detectCapabilities>>) => Object.fromEntries(list.map((s) => [s.id, s]));

describe('capability detection', () => {
  it('reports every capability explicitly, with a reason', async () => {
    const list = await detectCapabilities({ platform: 'android', settings: DEFAULT_SETTINGS });
    expect(list).toHaveLength(8);
    for (const status of list) expect(status.reason.length).toBeGreaterThan(0);
    expect(list.every((s) => s.availability === 'not_implemented' || s.availability === 'disabled')).toBe(true);
  });

  it('iOS native RSSI is unsupported even if a probe claims otherwise', async () => {
    const list = byId(
      await detectCapabilities(
        { platform: 'ios', settings: DEFAULT_SETTINGS },
        { wifi_rssi_native: async () => ({ availability: 'available', reason: 'fake' }) },
      ),
    );
    expect(list.wifi_rssi_native).toMatchObject({ availability: 'unsupported' });
  });

  it('never runs the external-probe check while the toggle is off', async () => {
    const probe = jest.fn(async () => ({ availability: 'available' as const, reason: 'paired' }));
    const off = byId(await detectCapabilities({ platform: 'ios', settings: DEFAULT_SETTINGS }, { external_probe: probe }));
    expect(off.external_probe).toMatchObject({ availability: 'disabled' });
    expect(probe).not.toHaveBeenCalled();

    const on = byId(
      await detectCapabilities({ platform: 'ios', settings: { ...DEFAULT_SETTINGS, externalProbeEnabled: true } }, { external_probe: probe }),
    );
    expect(on.external_probe).toMatchObject({ availability: 'available' });
  });

  it('reports a failing probe as unknown rather than available', async () => {
    const list = byId(
      await detectCapabilities(
        { platform: 'android', settings: DEFAULT_SETTINGS },
        { ar_tracking: async () => { throw new Error('ARCore missing'); } },
      ),
    );
    expect(list.ar_tracking).toMatchObject({ availability: 'unknown', reason: 'Detection failed: ARCore missing' });
  });

  it('marks everything unsupported off iOS/Android', async () => {
    const list = await detectCapabilities({ platform: 'other', settings: DEFAULT_SETTINGS });
    expect(list.every((s) => s.availability === 'unsupported')).toBe(true);
  });
});

describe('provider registry', () => {
  it('rejects duplicate provider ids', () => {
    const registry = new Registry<{ id: string }>().register({ id: 'android-wifi' });
    expect(() => registry.register({ id: 'android-wifi' })).toThrow(/already registered/);
  });
});
