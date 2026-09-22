export interface Migration {
  /** Contiguous from 1. Never edit or renumber a migration after it ships. */
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}
