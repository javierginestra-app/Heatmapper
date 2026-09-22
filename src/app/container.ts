import { Platform } from 'react-native';
import { Registry, type MeasurementProvider, type SettingsStore, type TrackingProvider } from '@/core';
import { type AppPlatform, type CapabilityProbes } from '@/modules/capabilities';
import { createSettingsStore, MIGRATIONS, openDeviceDatabase, runMigrations, type SqlDriver } from '@/modules/storage';

/** Every service the app uses, wired in one place. Features receive these; they never construct them. */
export interface Container {
  readonly platform: AppPlatform;
  readonly db: SqlDriver;
  readonly schemaVersion: number;
  readonly settings: SettingsStore;
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
  // Stage 0 registers none, so every capability reports "not implemented".
  const measurementProviders = new Registry<MeasurementProvider>();
  const trackingProviders = new Registry<TrackingProvider>();
  const capabilityProbes: CapabilityProbes = {};

  return {
    platform: currentPlatform(),
    db,
    schemaVersion: migration.toVersion,
    settings: createSettingsStore(db),
    measurementProviders,
    trackingProviders,
    capabilityProbes,
  };
}
