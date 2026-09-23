import {
  validateLocation,
  validateProject,
  ValidationError,
  type Location,
  type LocationKind,
  type MeasurementMode,
  type Project,
  type ProjectRepository,
  type SessionHistoryQuery,
  type SessionStatus,
  type SessionSummary,
} from '@/core';
import { type SqlDriver, type SqlRow } from './sqlDriver';

const str = (v: SqlRow[string] | undefined) => (v == null ? null : String(v));
const num = (v: SqlRow[string] | undefined) => (v == null ? null : Number(v));

function toProject(r: SqlRow): Project {
  return {
    id: String(r.id),
    name: String(r.name),
    address: str(r.address),
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    description: str(r.description),
    rssiTargetDbm: num(r.rssi_target_dbm),
    createdAtMs: Number(r.created_at_ms),
    updatedAtMs: Number(r.updated_at_ms),
  };
}

function toLocation(r: SqlRow): Location {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    parentId: str(r.parent_id),
    kind: String(r.kind) as LocationKind,
    name: String(r.name),
    sortOrder: Number(r.sort_order),
    createdAtMs: Number(r.created_at_ms),
    updatedAtMs: Number(r.updated_at_ms),
  };
}

const blankToNull = (v: string | null) => (v === null || v.trim() === '' ? null : v.trim());

export function createProjectRepository(db: SqlDriver): ProjectRepository {
  async function listLocations(projectId: string): Promise<Location[]> {
    const rows = await db.execute(
      'SELECT * FROM locations WHERE project_id = ? ORDER BY sort_order, created_at_ms',
      [projectId],
    );
    return rows.map(toLocation);
  }

  return {
    async listProjects() {
      return (await db.execute('SELECT * FROM projects ORDER BY updated_at_ms DESC')).map(toProject);
    },

    async getProject(id) {
      const [row] = await db.execute('SELECT * FROM projects WHERE id = ?', [id]);
      return row ? toProject(row) : null;
    },

    async saveProject(project) {
      const issues = validateProject(project);
      if (issues.length > 0) throw new ValidationError(issues);
      await db.execute(
        `INSERT INTO projects (id, name, address, latitude, longitude, description, rssi_target_dbm, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address,
           latitude = excluded.latitude, longitude = excluded.longitude, description = excluded.description,
           rssi_target_dbm = excluded.rssi_target_dbm, updated_at_ms = excluded.updated_at_ms`,
        [
          project.id,
          project.name.trim(),
          blankToNull(project.address),
          project.latitude,
          project.longitude,
          blankToNull(project.description),
          project.rssiTargetDbm,
          project.createdAtMs,
          project.updatedAtMs,
        ],
      );
    },

    async deleteProject(id) {
      await db.execute('DELETE FROM projects WHERE id = ?', [id]);
    },

    listLocations,

    async saveLocation(location) {
      const project = await db.execute('SELECT id FROM projects WHERE id = ?', [location.projectId]);
      if (project.length === 0) throw new ValidationError([{ field: 'projectId', message: 'Project not found' }]);
      const [existing] = await db.execute('SELECT project_id FROM locations WHERE id = ?', [location.id]);
      if (existing && existing.project_id !== location.projectId) {
        throw new ValidationError([{ field: 'projectId', message: 'A location cannot move between projects' }]);
      }
      const issues = validateLocation(location, await listLocations(location.projectId));
      if (issues.length > 0) throw new ValidationError(issues);
      await db.transaction(async () => {
        await db.execute(
          `INSERT INTO locations (id, project_id, parent_id, kind, name, sort_order, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, kind = excluded.kind,
             name = excluded.name, sort_order = excluded.sort_order, updated_at_ms = excluded.updated_at_ms`,
          [
            location.id,
            location.projectId,
            location.parentId,
            location.kind,
            location.name.trim(),
            location.sortOrder,
            location.createdAtMs,
            location.updatedAtMs,
          ],
        );
        // Editing a location counts as editing its project, so recent projects sort first.
        await db.execute('UPDATE projects SET updated_at_ms = MAX(updated_at_ms, ?) WHERE id = ?', [
          location.updatedAtMs,
          location.projectId,
        ]);
      });
    },

    async deleteLocation(id) {
      await db.execute('DELETE FROM locations WHERE id = ?', [id]);
    },

    async listSessionHistory({ projectId, locationId }: SessionHistoryQuery): Promise<SessionSummary[]> {
      const scope =
        locationId === null
          ? { cte: '', filter: 's.project_id = ?', params: [projectId] }
          : {
              cte: `WITH RECURSIVE scope(id) AS (
                      SELECT id FROM locations WHERE id = ? AND project_id = ?
                      UNION ALL SELECT l.id FROM locations l JOIN scope ON l.parent_id = scope.id)`,
              filter: 's.location_id IN (SELECT id FROM scope)',
              params: [locationId, projectId],
            };
      const rows = await db.execute(
        `${scope.cte}
         SELECT s.*, l.name AS location_name,
           (SELECT COUNT(*) FROM samples WHERE samples.session_id = s.id) AS sample_count
         FROM survey_sessions s JOIN locations l ON l.id = s.location_id
         WHERE ${scope.filter}
         ORDER BY s.started_at_ms DESC`,
        scope.params,
      );
      return rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        locationId: String(r.location_id),
        mode: String(r.mode) as MeasurementMode,
        status: String(r.status) as SessionStatus,
        startedAtMs: Number(r.started_at_ms),
        endedAtMs: num(r.ended_at_ms),
        locationName: String(r.location_name),
        sampleCount: Number(r.sample_count),
      }));
    },
  };
}
