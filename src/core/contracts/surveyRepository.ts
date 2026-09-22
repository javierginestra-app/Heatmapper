import { type Location, type Project, type SurveyGap, type SurveySeries, type SurveySession } from '../project';
import { type Sample } from '../samples';
import { type BatchResult } from '../validation';

export interface SampleQuery {
  readonly sessionId?: string;
  readonly locationId?: string;
  readonly kind?: Sample['kind'];
}

/** Offline persistence for projects, locations and survey data. Samples are append-only. */
export interface SurveyRepository {
  listProjects(): Promise<readonly Project[]>;
  getProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;

  listLocations(projectId: string): Promise<readonly Location[]>;
  saveLocation(location: Location): Promise<void>;
  deleteLocation(id: string): Promise<void>;

  saveSession(session: SurveySession): Promise<void>;
  listSessions(locationId: string): Promise<readonly SurveySession[]>;
  saveSeries(series: SurveySeries): Promise<void>;
  recordGap(gap: SurveyGap): Promise<void>;

  /** Validates, rejects duplicates and stale readings, and stores raw values. */
  appendSamples(samples: readonly unknown[]): Promise<BatchResult<Sample>>;
  listSamples(query: SampleQuery): Promise<readonly Sample[]>;
}
