export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

/** Minimal async SQLite surface, so storage logic runs on op-sqlite and in Node tests. */
export interface SqlDriver {
  execute(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
