import { type Location, type Project, type SurveySession } from '../project';

export interface SessionSummary extends SurveySession {
  readonly locationName: string;
  readonly sampleCount: number;
}

export interface SessionHistoryQuery {
  readonly projectId: string;
  /** null = whole project; otherwise this location and everything nested in it. */
  readonly locationId: string | null;
}

/**
 * Offline persistence for projects and the Building → Floor → Room tree.
 * Saves are upserts and throw ValidationError when a rule is broken.
 * Deletes cascade to nested locations, sessions and samples.
 */
export interface ProjectRepository {
  listProjects(): Promise<readonly Project[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;

  listLocations(projectId: string): Promise<readonly Location[]>;
  saveLocation(location: Location): Promise<void>;
  deleteLocation(id: string): Promise<void>;

  /** Newest first. */
  listSessionHistory(query: SessionHistoryQuery): Promise<readonly SessionSummary[]>;
}
