import { type SurveyGap, type SurveySeries, type SurveySession } from '../project';
import { type Sample } from '../samples';
import { type BatchResult } from '../validation';

export interface SampleQuery {
  readonly sessionId?: string;
  readonly locationId?: string;
  readonly kind?: Sample['kind'];
}

/**
 * Survey capture persistence. Samples are append-only. Projects and locations live in ProjectRepository.
 * Sessions, series and gaps are upserts (a gap is saved open and saved again when it closes).
 */
export interface SurveyRepository {
  saveSession(session: SurveySession): Promise<void>;
  getSession(id: string): Promise<SurveySession | null>;
  saveSeries(series: SurveySeries): Promise<void>;
  listSeries(sessionId: string): Promise<readonly SurveySeries[]>;
  recordGap(gap: SurveyGap): Promise<void>;
  listGaps(sessionId: string): Promise<readonly SurveyGap[]>;

  /**
   * Validates, rejects duplicates and stale readings, and stores raw values.
   * Also rejects samples whose session is not recording, or whose series is
   * missing, belongs to another session or has a different series key.
   */
  appendSamples(samples: readonly unknown[]): Promise<BatchResult<Sample>>;
  /** Oldest first. */
  listSamples(query: SampleQuery): Promise<readonly Sample[]>;

  /**
   * After a crash or force-quit, sessions left "recording" become "paused"
   * with an open-ended gap from their last sample. Returns how many changed.
   */
  interruptOpenSessions(gapId: (sessionId: string) => string): Promise<number>;
}
