import { randomUUID } from 'expo-crypto';
import * as ExpoLocation from 'expo-location';
import { Platform } from 'react-native';
import {
  Registry,
  type MeasurementProvider,
  type MeasurementCapabilities,
  type ProjectRepository,
  type SettingsStore,
  type SurveyRepository,
  type TrackingProvider,
} from '@/core';
import { createAndroidWifiProvider, loadAndroidWifiBridge } from '@/modules/androidWifi';
import { type AppPlatform, type CapabilityProbe, type CapabilityProbes } from '@/modules/capabilities';
import { createEndpointPerformanceProvider } from '@/modules/performance';
import { type Geolocator } from '@/modules/projects';
import {
  createProjectRepository,
  createSettingsStore,
  createSurveyRepository,
  MIGRATIONS,
  openDeviceDatabase,
  runMigrations,
  type SqlDriver,
} from '@/modules/storage';
import { expoGeolocator } from './geolocator';
import { isOnWifi } from './network';

/** Every service the app uses, wired in one place. Features receive these; they never construct them. */
export interface Container {
  readonly platform: AppPlatform;
  readonly db: SqlDriver;
  readonly schemaVersion: number;
  readonly settings: SettingsStore;
  readonly projects: ProjectRepository;
  readonly surveys: SurveyRepository;
  readonly geolocator: Geolocator;
  readonly newId: () => string;
  readonly now: () => number;
  readonly measurementProviders: Registry<MeasurementProvider>;
  /** This device's Signal/RSSI source, or null with the reason the survey screen shows. */
  readonly signalProvider: MeasurementProvider | null;
  readonly signalUnavailableReason: string;
  readonly performanceProvider: MeasurementProvider | null;
  readonly trackingProviders: Registry<TrackingProvider>;
  readonly capabilityProbes: CapabilityProbes;
}

function currentPlatform(): AppPlatform {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'other';
}

export async function createContainer(): Promise<Container> {
  const db = await openDeviceDatabase();
  const migration = await runMigrations(db, MIGRATIONS);

  const surveys = createSurveyRepository(db);
  // Sessions left recording by a crash or force-quit become paused with an open gap.
  await surveys.interruptOpenSessions(() => randomUUID());

  const platform = currentPlatform();
  const measurementProviders = new Registry<MeasurementProvider>();
  const trackingProviders = new Registry<TrackingProvider>();
  const capabilityProbes: CapabilityProbes = {};
  const probeOf =
    (provider: MeasurementProvider): CapabilityProbe =>
    async () => {
      const caps: MeasurementCapabilities = await provider.capabilities();
      return { availability: caps.availability, reason: caps.reason };
    };

  let signalProvider: MeasurementProvider | null = null;
  let signalUnavailableReason = 'External probe support arrives in build stage 5.';
  if (platform === 'android') {
    const bridge = loadAndroidWifiBridge();
    if (bridge) {
      signalProvider = createAndroidWifiProvider({
        bridge,
        newId: randomUUID,
        now: Date.now,
        requestLocationPermission: async () => (await ExpoLocation.requestForegroundPermissionsAsync()).granted,
      });
      measurementProviders.register(signalProvider);
      capabilityProbes.wifi_rssi_native = probeOf(signalProvider);
    } else {
      signalUnavailableReason = 'The native Wi-Fi module is missing from this build. Rebuild the dev client.';
      capabilityProbes.wifi_rssi_native = async () => ({ availability: 'unknown', reason: signalUnavailableReason });
    }
  } else if (platform === 'ios') {
    signalUnavailableReason = 'iOS has no general-purpose live Wi-Fi RSSI API. Use Performance mode, or an external probe (build stage 5).';
  }

  const performanceProvider = createEndpointPerformanceProvider({
    fetch: (url, init) => fetch(url, init),
    now: Date.now,
    monotonic: () => performance.now(),
    newId: randomUUID,
    isOnWifi,
    deviceModel: null,
  });
  measurementProviders.register(performanceProvider);
  capabilityProbes.performance_test = probeOf(performanceProvider);

  return {
    platform,
    db,
    schemaVersion: migration.toVersion,
    settings: createSettingsStore(db),
    projects: createProjectRepository(db),
    surveys,
    geolocator: expoGeolocator,
    newId: randomUUID,
    now: Date.now,
    measurementProviders,
    signalProvider,
    signalUnavailableReason,
    performanceProvider,
    trackingProviders,
    capabilityProbes,
  };
}
