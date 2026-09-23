import { DatabaseSync } from 'node:sqlite';
import { type SqlDriver, type SqlRow, type SqlValue } from '@/modules/storage/sqlDriver';

/** Node's built-in SQLite behind the same driver contract the app uses on device. */
export function openMemoryDatabase(): SqlDriver & { raw: DatabaseSync } {
  return openDatabaseAt(':memory:');
}

/** A file-backed database, for tests that close and reopen it like an app restart. */
export function openDatabaseAt(location: string): SqlDriver & { raw: DatabaseSync } {
  const raw = new DatabaseSync(location);
  raw.exec('PRAGMA foreign_keys = ON');
  const execute = async (sql: string, params: readonly SqlValue[] = []) =>
    raw.prepare(sql).all(...params) as SqlRow[];
  return {
    raw,
    execute,
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      raw.exec('BEGIN');
      try {
        const value = await fn();
        raw.exec('COMMIT');
        return value;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      raw.close();
    },
  };
}
