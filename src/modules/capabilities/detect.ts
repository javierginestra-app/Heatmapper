import { type AppSettings, type CapabilityId, type CapabilityStatus } from '@/core';

export type AppPlatform = 'ios' | 'android' | 'other';

export interface CapabilityEnvironment {
  readonly platform: AppPlatform;
  readonly settings: AppSettings;
}

/** A native check registered by the app layer once a stage ships the capability. */
export type CapabilityProbe = () => Promise<Omit<CapabilityStatus, 'id'>>;

export type CapabilityProbes = Partial<Record<CapabilityId, CapabilityProbe>>;

const PLANNED: Readonly<Record<CapabilityId, { stage: string; label: string }>> = {
  wifi_rssi_native: { stage: '2', label: 'Native Wi-Fi RSSI' },
  performance_test: { stage: '2', label: 'Performance tests' },
  ar_tracking: { stage: '3A', label: 'AR tracking' },
  room_scan: { stage: '3A', label: 'Room scanning' },
  depth_sensing: { stage: '3A', label: 'Depth sensing' },
  pdf_export: { stage: '4', label: 'PDF export' },
  external_probe: { stage: '5', label: 'External Wi-Fi probe' },
  subscriptions: { stage: '6', label: 'Subscriptions' },
};

export const CAPABILITY_IDS = Object.keys(PLANNED) as CapabilityId[];

export function capabilityLabel(id: CapabilityId): string {
  return PLANNED[id].label;
}

/** Platform facts that no probe may override. */
function fixedStatus(id: CapabilityId, env: CapabilityEnvironment): Omit<CapabilityStatus, 'id'> | null {
  if (env.platform === 'other') {
    return { availability: 'unsupported', reason: 'Heat Mapper Live runs on iOS and Android only.' };
  }
  if (id === 'wifi_rssi_native' && env.platform === 'ios') {
    return {
      availability: 'unsupported',
      reason: 'iOS has no general-purpose live Wi-Fi RSSI API. Use Performance mode or an external probe.',
    };
  }
  if (id === 'external_probe' && !env.settings.externalProbeEnabled) {
    return { availability: 'disabled', reason: 'External probe is off in Settings. No Bluetooth activity occurs.' };
  }
  return null;
}

/**
 * Reports every capability explicitly. Unregistered probes are "not implemented",
 * never assumed available; a failing probe is "unknown" with its error.
 */
export async function detectCapabilities(
  env: CapabilityEnvironment,
  probes: CapabilityProbes = {},
): Promise<CapabilityStatus[]> {
  return Promise.all(
    CAPABILITY_IDS.map(async (id): Promise<CapabilityStatus> => {
      const fixed = fixedStatus(id, env);
      if (fixed) return { id, ...fixed };
      const probe = probes[id];
      if (!probe) {
        return { id, availability: 'not_implemented', reason: `Planned for build stage ${PLANNED[id].stage}.` };
      }
      try {
        return { id, ...(await probe()) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { id, availability: 'unknown', reason: `Detection failed: ${message}` };
      }
    }),
  );
}
