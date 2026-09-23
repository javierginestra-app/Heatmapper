import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import {
  Registry,
  type MeasurementProvider,
  type ProjectRepository,
  type SettingsStore,
  type TrackingProvider,
} from '@/core';
import { type AppPlatform, type CapabilityProbes } from '@/modules/capabilities';
import { type Geolocator } from '@/modules/projects';
import {
  createProjectRepository,
  createSettingsStore,
  MIGRATIONS,
  openDeviceDatabase,
  runMigrations,
  type SqlDriver,
} from '@/modules/storage';
import { expoGeolocator } from './geolocator';

/** Every service the app uses, wired in one place. Features receive these; they never construct them. */
export interface Container {
  readonly platform: AppPlatform;
  readonly db: SqlDriver;
  readonly schemaVersion: number;
  readonly settings: SettingsStore;
  readonly projects: ProjectRepository;
  readonly geolocator: Geolocator;
  readonly newId: () => string;
  readonly now: () => number;
  readonly measurementProviders: Registry<MeasurementProvider>;
  readonly trackingProviders: Registry<TrackingProvider>;
  readonly capabilityProbes: CapabilityProbes;
}

function currentPlatform(): AppPlatform {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'other';
}

export async function createContainer(): Promise<Container> {
  const db = await openDeviceDatabase();
  const migration = await runMigrations(db, MIGRATIONS);

  // Real providers and their capability probes are registered here as stages ship.
  // None are registered yet, so survey capabilities report "not implemented".
  const measurementProviders = new Registry<MeasurementProvider>();
  const trackingProviders = new Registry<TrackingProvider>();
  const capabilityProbes: CapabilityProbes = {};

  return {
    platform: currentPlatform(),
    db,
    schemaVersion: migration.toVersion,
    settings: createSettingsStore(db),
    projects: createProjectRepository(db),
    geolocator: expoGeolocator,
    newId: randomUUID,
    now: Date.now,
    measurementProviders,
    trackingProviders,
    capabilityProbes,
  };
}
