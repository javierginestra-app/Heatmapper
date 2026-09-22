import { open } from '@op-engineering/op-sqlite';
import { type SqlDriver, type SqlRow, type SqlValue } from './sqlDriver';

export const DATABASE_NAME = 'heat-mapper.db';

class OpSqliteDriver implements SqlDriver {
  constructor(private readonly db: ReturnType<typeof open>) {}

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<SqlRow[]> {
    const result = await this.db.execute(sql, [...params]);
    return (result.rows ?? []) as SqlRow[];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.db.execute('BEGIN');
    try {
      const value = await fn();
      await this.db.execute('COMMIT');
      return value;
    } catch (error) {
      await this.db.execute('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export async function openDeviceDatabase(name: string = DATABASE_NAME): Promise<SqlDriver> {
  const db = open({ name });
  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('PRAGMA foreign_keys = ON');
  return new OpSqliteDriver(db);
}
