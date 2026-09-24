import { DEFAULT_SETTINGS } from '@/core';
import { runMigrations } from '@/modules/storage/migrations/runner';
import { MIGRATIONS } from '@/modules/storage/migrations';
import { createSettingsStore } from '@/modules/storage/settingsStore';
import { openMemoryDatabase } from './helpers/nodeSqliteDriver';

async function migrated() {
  const db = openMemoryDatabase();
  await runMigrations(db, MIGRATIONS);
  return db;
}

describe('migrations', () => {
  it('applies all migrations once and is a no-op on the next launch', async () => {
    const db = openMemoryDatabase();
    const first = await runMigrations(db, MIGRATIONS);
    expect(first).toMatchObject({ fromVersion: 0, toVersion: MIGRATIONS.length });
    const second = await runMigrations(db, MIGRATIONS);
    expect(second.applied).toEqual([]);
  });

  it('rolls back a failing migration and leaves the version unchanged', async () => {
    const db = await migrated();
    const broken = [...MIGRATIONS, { version: MIGRATIONS.length + 1, name: 'broken', statements: ['CREATE TABLE t (a)', 'NOT SQL'] }];
    await expect(runMigrations(db, broken)).rejects.toThrow();
    expect(await db.execute("SELECT name FROM sqlite_master WHERE name = 't'")).toEqual([]);
    expect((await runMigrations(db, MIGRATIONS)).fromVersion).toBe(MIGRATIONS.length);
  });

  it('refuses to open a database written by a newer app version', async () => {
    const db = await migrated();
    await expect(runMigrations(db, MIGRATIONS.slice(0, 0))).rejects.toThrow(/newer than this app/);
  });

  it('rejects out-of-order migration lists', async () => {
    const db = openMemoryDatabase();
    await expect(runMigrations(db, [{ version: 2, name: 'x', statements: [] }])).rejects.toThrow(/expected 1/);
  });
});

describe('schema v1 constraints', () => {
  async function seed() {
    const db = await migrated();
    await db.execute("INSERT INTO projects VALUES ('p1', 'HQ', NULL, NULL, NULL, NULL, NULL, 1, 1)");
    await db.execute("INSERT INTO locations VALUES ('b1', 'p1', NULL, 'building', 'Main', 0, 1, 1)");
    await db.execute("INSERT INTO locations VALUES ('f1', 'p1', 'b1', 'floor', 'Level 1', 0, 1, 1)");
    await db.execute("INSERT INTO survey_sessions VALUES ('s1', 'p1', 'f1', 'signal', 'recording', 1, NULL)");
    await db.execute(
      "INSERT INTO survey_series (id, session_id, series_key, kind, source_kind, provider_id, started_at_ms) VALUES ('sr1', 's1', 'k', 'rssi', 'android_wifi', 'android-wifi', 1)",
    );
    return db;
  }
  const insertSample = (id: string, xMetres: number | null = null) =>
    `INSERT INTO samples (id, kind, project_id, location_id, session_id, series_id, collected_start_ms, collected_end_ms, received_at_ms, x_m, tracking_quality, source_kind, provider_id)
     VALUES ('${id}', 'rssi', 'p1', 'f1', 's1', 'sr1', 1, 1, 1, ${xMetres ?? 'NULL'}, 'manual', 'android_wifi', 'android-wifi')`;

  it('rejects duplicate sample ids at the database level', async () => {
    const db = await seed();
    await db.execute(insertSample('x'));
    await expect(db.execute(insertSample('x'))).rejects.toThrow(/UNIQUE/);
  });

  it('keeps position and position source together', async () => {
    const db = await seed();
    await expect(db.execute(insertSample('y', 3))).rejects.toThrow(/CHECK/);
  });

  it('deleting a building removes its nested floors, sessions and samples', async () => {
    const db = await seed();
    await db.execute(insertSample('z'));
    await db.execute("INSERT INTO sample_metrics VALUES ('z', 'rssi_dbm', -55, 'dBm')");
    await db.execute("DELETE FROM locations WHERE id = 'b1'");
    for (const table of ['locations', 'survey_sessions', 'samples', 'sample_metrics']) {
      expect(await db.execute(`SELECT COUNT(*) AS n FROM ${table}`)).toEqual([{ n: 0 }]);
    }
  });
});

describe('settings store', () => {
  it('defaults the external probe to off and persists changes', async () => {
    const db = await migrated();
    const store = createSettingsStore(db);
    expect(await store.get()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.externalProbeEnabled).toBe(false);
    await store.update({ externalProbeEnabled: true, localTestEndpoint: 'http://192.168.1.10:8787' });
    expect(await createSettingsStore(db).get()).toEqual({
      ...DEFAULT_SETTINGS,
      externalProbeEnabled: true,
      localTestEndpoint: 'http://192.168.1.10:8787',
    });
  });

  it('ignores unknown keys and falls back on corrupt or mistyped values', async () => {
    const db = await migrated();
    await db.execute("INSERT INTO app_settings VALUES ('externalProbeEnabled', '\"yes\"')");
    const store = createSettingsStore(db);
    expect(await store.get()).toEqual(DEFAULT_SETTINGS);
    await store.update({ bogus: 1 } as never);
    expect(await db.execute("SELECT key FROM app_settings WHERE key = 'bogus'")).toEqual([]);
  });
});
