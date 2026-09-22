import { DEFAULT_SETTINGS, type AppSettings, type SettingsStore } from '@/core';
import { type SqlDriver } from './sqlDriver';

/** Settings are stored as JSON per key; missing or unreadable keys fall back to defaults. */
export function createSettingsStore(db: SqlDriver): SettingsStore {
  async function get(): Promise<AppSettings> {
    const rows = await db.execute('SELECT key, value FROM app_settings');
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        stored[String(row.key)] = JSON.parse(String(row.value));
      } catch {
        // Corrupt value: ignore it and keep the default.
      }
    }
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
      if (typeof stored[key] === typeof DEFAULT_SETTINGS[key]) {
        (settings as Record<string, unknown>)[key] = stored[key];
      }
    }
    return settings;
  }

  async function update(patch: Partial<AppSettings>): Promise<AppSettings> {
    await db.transaction(async () => {
      for (const [key, value] of Object.entries(patch)) {
        if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
        await db.execute(
          'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, JSON.stringify(value)],
        );
      }
    });
    return get();
  }

  return { get, update };
}
