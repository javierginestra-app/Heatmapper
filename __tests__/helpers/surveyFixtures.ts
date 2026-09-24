import { type Location, type Project } from '@/core';
import { MIGRATIONS } from '@/modules/storage/migrations';
import { runMigrations } from '@/modules/storage/migrations/runner';
import { createProjectRepository } from '@/modules/storage/projectRepository';
import { createSurveyRepository } from '@/modules/storage/surveyRepository';
import { type SqlDriver } from '@/modules/storage/sqlDriver';
import { openMemoryDatabase } from './nodeSqliteDriver';

export const project: Project = {
  id: 'p1',
  name: 'Office',
  address: null,
  latitude: null,
  longitude: null,
  description: null,
  rssiTargetDbm: null,
  createdAtMs: 1,
  updatedAtMs: 1,
};

export const room: Location = {
  id: 'l1',
  projectId: 'p1',
  parentId: null,
  kind: 'room',
  name: 'Lab',
  sortOrder: 0,
  createdAtMs: 1,
  updatedAtMs: 1,
};

/** Migrated database with project p1 and room l1. */
export async function surveyDb(db: SqlDriver = openMemoryDatabase()) {
  await runMigrations(db, MIGRATIONS);
  const projects = createProjectRepository(db);
  await projects.saveProject(project);
  await projects.saveLocation(room);
  return { db, projects, surveys: createSurveyRepository(db) };
}

export function sequentialIds(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
