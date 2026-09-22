import { type SqlDriver } from '../sqlDriver';
import { type Migration } from './types';

export interface MigrationReport {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly string[];
}

function assertOrdered(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migration "${m.name}" has version ${m.version}; expected ${i + 1}`);
  });
}

/** Applies pending migrations, each in its own transaction. Refuses to run against a newer schema. */
export async function runMigrations(db: SqlDriver, migrations: readonly Migration[]): Promise<MigrationReport> {
  assertOrdered(migrations);
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at_ms INTEGER NOT NULL
    )`,
  );
  const rows = await db.execute('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations');
  const fromVersion = Number(rows[0]?.version ?? 0);
  if (fromVersion > migrations.length) {
    throw new Error(`Database schema v${fromVersion} is newer than this app (v${migrations.length})`);
  }

  const applied: string[] = [];
  for (const migration of migrations.slice(fromVersion)) {
    await db.transaction(async () => {
      for (const statement of migration.statements) await db.execute(statement);
      await db.execute('INSERT INTO schema_migrations (version, name, applied_at_ms) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        Date.now(),
      ]);
    });
    applied.push(`${migration.version}_${migration.name}`);
  }
  return { fromVersion, toVersion: migrations.length, applied };
}
