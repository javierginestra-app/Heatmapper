import { type AppSettings } from '../settings';

export interface SettingsStore {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}
