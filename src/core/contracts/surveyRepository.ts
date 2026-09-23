import { type SurveyGap, type SurveySeries, type SurveySession } from '../project';
import { type Sample } from '../samples';
import { type BatchResult } from '../validation';

export interface SampleQuery {
  readonly sessionId?: string;
  readonly locationId?: string;
  readonly kind?: Sample['kind'];
}

/** Survey capture persistence. Samples are append-only. Projects and locations live in ProjectRepository. */
export interface SurveyRepository {
  saveSession(session: SurveySession): Promise<void>;
  saveSeries(series: SurveySeries): Promise<void>;
  recordGap(gap: SurveyGap): Promise<void>;

  /** Validates, rejects duplicates and stale readings, and stores raw values. */
  appendSamples(samples: readonly unknown[]): Promise<BatchResult<Sample>>;
  listSamples(query: SampleQuery): Promise<readonly Sample[]>;
}
