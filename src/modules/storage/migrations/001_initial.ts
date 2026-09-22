import { type Migration } from './types';

/** Full data model for Stages 1–2. Metric values live in rows with explicit units. */
export const initial: Migration = {
  version: 1,
  name: 'initial',
  statements: [
    `CREATE TABLE app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      address TEXT,
      latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
      longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
      description TEXT,
      rssi_target_dbm INTEGER,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    )`,
    `CREATE TABLE locations (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('building', 'floor', 'room')),
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    )`,
    'CREATE INDEX idx_locations_project ON locations(project_id, parent_id, sort_order)',
    `CREATE TABLE survey_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK (mode IN ('signal', 'performance')),
      status TEXT NOT NULL CHECK (status IN ('recording', 'paused', 'completed')),
      started_at_ms INTEGER NOT NULL,
      ended_at_ms INTEGER
    )`,
    'CREATE INDEX idx_sessions_location ON survey_sessions(location_id, started_at_ms)',
    `CREATE TABLE survey_series (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES survey_sessions(id) ON DELETE CASCADE,
      series_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('rssi', 'performance')),
      source_kind TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      device_id TEXT,
      ssid TEXT,
      bssid TEXT,
      channel INTEGER,
      band TEXT,
      scope TEXT CHECK (scope IS NULL OR scope IN ('local_network', 'internet')),
      endpoint_id TEXT,
      started_at_ms INTEGER NOT NULL
    )`,
    `CREATE TABLE survey_gaps (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES survey_sessions(id) ON DELETE CASCADE,
      series_id TEXT REFERENCES survey_series(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      ended_at_ms INTEGER
    )`,
    `CREATE TABLE samples (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('rssi', 'performance')),
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES survey_sessions(id) ON DELETE CASCADE,
      series_id TEXT NOT NULL REFERENCES survey_series(id) ON DELETE CASCADE,
      frame_id TEXT,
      collected_start_ms INTEGER NOT NULL,
      collected_end_ms INTEGER NOT NULL CHECK (collected_end_ms >= collected_start_ms),
      received_at_ms INTEGER NOT NULL,
      x_m REAL,
      y_m REAL,
      z_m REAL,
      position_source TEXT CHECK (position_source IS NULL OR position_source IN ('tracking', 'manual_pin')),
      tracking_quality TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      device_id TEXT,
      device_model TEXT,
      ssid TEXT,
      bssid TEXT,
      channel INTEGER,
      band TEXT,
      scope TEXT,
      endpoint_id TEXT,
      bytes_transferred INTEGER,
      CHECK ((x_m IS NULL) = (position_source IS NULL))
    )`,
    'CREATE INDEX idx_samples_session ON samples(session_id, collected_start_ms)',
    'CREATE INDEX idx_samples_location ON samples(location_id, kind)',
    `CREATE TABLE sample_metrics (
      sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      PRIMARY KEY (sample_id, metric)
    )`,
  ],
};
