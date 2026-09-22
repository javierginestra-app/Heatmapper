import { type MetricKind } from '../measurement';

export interface ReportScope {
  readonly projectId: string;
  /** null = whole project; otherwise a building, floor or room. */
  readonly locationId: string | null;
}

export interface ReportRequest {
  readonly scope: ReportScope;
  readonly metric: MetricKind;
  /** Reports render from an immutable snapshot, never from live tables. */
  readonly snapshotId: string;
}

export interface ExportedReport {
  readonly uri: string;
  readonly snapshotId: string;
  readonly pageCount: number;
  readonly createdAtMs: number;
}

export interface ReportExporter {
  exportPdf(request: ReportRequest): Promise<ExportedReport>;
}
