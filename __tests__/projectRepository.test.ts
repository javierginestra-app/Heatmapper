import fs from 'fs';
import os from 'os';
import path from 'path';
import { ValidationError, type Location, type Project } from '@/core';
import { MIGRATIONS } from '@/modules/storage/migrations';
import { runMigrations } from '@/modules/storage/migrations/runner';
import { createProjectRepository } from '@/modules/storage/projectRepository';
import { type SqlDriver } from '@/modules/storage/sqlDriver';
import { openDatabaseAt, openMemoryDatabase } from './helpers/nodeSqliteDriver';

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Head office',
  address: '1 Main St',
  latitude: 40.4168,
  longitude: -3.7038,
  description: null,
  rssiTargetDbm: null,
  createdAtMs: 1_000,
  updatedAtMs: 1_000,
  ...overrides,
});

const location = (id: string, kind: Location['kind'], parentId: string | null, overrides: Partial<Location> = {}): Location => ({
  id,
  projectId: 'p1',
  parentId,
  kind,
  name: id,
  sortOrder: 0,
  createdAtMs: 2_000,
  updatedAtMs: 2_000,
  ...overrides,
});

async function setup(db: SqlDriver = openMemoryDatabase()) {
  await runMigrations(db, MIGRATIONS);
  return { db, repo: createProjectRepository(db) };
}

async function seedTree(repo: ReturnType<typeof createProjectRepository>) {
  await repo.saveProject(project());
  await repo.saveLocation(location('b1', 'building', null));
  await repo.saveLocation(location('f1', 'floor', 'b1'));
  await repo.saveLocation(location('r1', 'room', 'f1'));
  await repo.saveLocation(location('f2', 'floor', 'b1', { sortOrder: 1 }));
}

async function addSession(db: SqlDriver, id: string, locationId: string, startedAtMs: number, samples = 0) {
  await db.execute(`INSERT INTO survey_sessions VALUES (?, 'p1', ?, 'signal', 'completed', ?, NULL)`, [id, locationId, startedAtMs]);
  await db.execute(
    `INSERT INTO survey_series (id, session_id, series_key, kind, source_kind, provider_id, started_at_ms) VALUES (?, ?, 'k', 'rssi', 'android_wifi', 'a', 1)`,
    [`${id}-series`, id],
  );
  for (let i = 0; i < samples; i++) {
    await db.execute(
      `INSERT INTO samples (id, kind, project_id, location_id, session_id, series_id, collected_start_ms, collected_end_ms, received_at_ms, tracking_quality, source_kind, provider_id)
       VALUES (?, 'rssi', 'p1', ?, ?, ?, 1, 1, 1, 'manual', 'android_wifi', 'a')`,
      [`${id}-s${i}`, locationId, id, `${id}-series`],
    );
  }
}

describe('project repository', () => {
  it('creates, updates (keeping createdAt) and lists newest first', async () => {
    const { repo } = await setup();
    await repo.saveProject(project());
    await repo.saveProject(project({ id: 'p2', name: 'Warehouse', updatedAtMs: 5_000 }));
    await repo.saveProject(project({ name: '  Head office (east)  ', address: '   ', createdAtMs: 9_999, updatedAtMs: 3_000 }));
    expect(await repo.getProject('p1')).toMatchObject({ name: 'Head office (east)', address: null, createdAtMs: 1_000 });
    expect((await repo.listProjects()).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it.each([
    ['blank name', { name: '  ' }, 'name'],
    ['half a GPS position', { longitude: null }, 'coordinates'],
    ['latitude out of range', { latitude: 91 }, 'coordinates'],
    ['non-integer RSSI target', { rssiTargetDbm: -67.5 }, 'rssiTargetDbm'],
    ['unparseable RSSI target', { rssiTargetDbm: Number.NaN }, 'rssiTargetDbm'],
    ['RSSI target out of range', { rssiTargetDbm: -20 }, 'rssiTargetDbm'],
  ])('rejects %s', async (_label, overrides, field) => {
    const { repo } = await setup();
    const error = await repo.saveProject(project(overrides)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues.map((i) => i.field)).toContain(field);
    expect(await repo.listProjects()).toEqual([]);
  });

  it('builds a nested tree ordered by sort order and bumps the project on edits', async () => {
    const { repo } = await setup();
    await seedTree(repo);
    expect((await repo.listLocations('p1')).map((l) => l.id)).toEqual(['b1', 'f1', 'r1', 'f2']);
    expect((await repo.getProject('p1'))!.updatedAtMs).toBe(2_000);
  });

  it('allows skipped levels but never inverted ones', async () => {
    const { repo } = await setup();
    await seedTree(repo);
    await expect(repo.saveLocation(location('r0', 'room', null))).resolves.toBeUndefined();
    await expect(repo.saveLocation(location('x', 'building', 'f1'))).rejects.toThrow(/cannot be placed inside a floor/);
    await expect(repo.saveLocation(location('x', 'room', 'r1'))).rejects.toThrow(ValidationError);
    await expect(repo.saveLocation(location('f1', 'room', 'b1'))).rejects.toThrow(/Existing children/);
  });

  it('rejects parents from another project and moving a location between projects', async () => {
    const { repo } = await setup();
    await seedTree(repo);
    await repo.saveProject(project({ id: 'p2' }));
    await expect(repo.saveLocation(location('x', 'floor', 'b1', { projectId: 'p2' }))).rejects.toThrow(/Parent location not found/);
    await expect(repo.saveLocation(location('b1', 'building', null, { projectId: 'p2' }))).rejects.toThrow(/between projects/);
    await expect(repo.saveLocation(location('x', 'building', null, { projectId: 'nope' }))).rejects.toThrow(/Project not found/);
  });

  it('scopes survey history to a location and everything nested in it, newest first', async () => {
    const { db, repo } = await setup();
    await seedTree(repo);
    await addSession(db, 's-building', 'b1', 10);
    await addSession(db, 's-room', 'r1', 30, 3);
    await addSession(db, 's-floor2', 'f2', 20);

    const floor = await repo.listSessionHistory({ projectId: 'p1', locationId: 'f1' });
    expect(floor).toEqual([expect.objectContaining({ id: 's-room', locationName: 'r1', sampleCount: 3, mode: 'signal' })]);
    const all = await repo.listSessionHistory({ projectId: 'p1', locationId: null });
    expect(all.map((s) => s.id)).toEqual(['s-room', 's-floor2', 's-building']);
    expect(await repo.listSessionHistory({ projectId: 'other', locationId: 'f1' })).toEqual([]);
  });

  it('deleting a location removes its subtree and surveys; deleting a project removes everything', async () => {
    const { db, repo } = await setup();
    await seedTree(repo);
    await addSession(db, 's1', 'r1', 1, 2);
    await repo.deleteLocation('f1');
    expect((await repo.listLocations('p1')).map((l) => l.id)).toEqual(['b1', 'f2']);
    expect(await db.execute('SELECT COUNT(*) AS n FROM samples')).toEqual([{ n: 0 }]);
    await repo.deleteProject('p1');
    expect(await db.execute('SELECT COUNT(*) AS n FROM locations')).toEqual([{ n: 0 }]);
  });

  it('saved projects survive an app restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-'));
    const file = path.join(dir, 'heat-mapper.db');
    try {
      const first = await setup(openDatabaseAt(file));
      await seedTree(first.repo);
      await first.db.close();

      const second = await setup(openDatabaseAt(file));
      expect(await second.repo.getProject('p1')).toEqual(project({ updatedAtMs: 2_000 }));
      expect((await second.repo.listLocations('p1')).map((l) => [l.id, l.parentId])).toEqual([
        ['b1', null], ['f1', 'b1'], ['r1', 'f1'], ['f2', 'b1'],
      ]);
      await second.db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
