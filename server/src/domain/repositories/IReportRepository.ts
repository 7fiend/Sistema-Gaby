import type { Paginated, ReportsQuery, ReportType } from '@gaby/shared';

export interface ReportRow {
  id: string;
  type: ReportType;
  format: 'PDF' | 'XLSX' | 'CSV';
  params: unknown;
  filePath: string;
  createdBy: string;
  createdAt: Date;
}

export interface ReportCreateInput {
  type: ReportType;
  params: unknown;
  format: 'PDF' | 'XLSX' | 'CSV';
  filePath: string;
  createdById: string;
}

/** Persistencia de metadatos de reportes generados (append-only, RF-12.3). */
export interface IReportRepository {
  create(input: ReportCreateInput): Promise<ReportRow>;
  list(query: ReportsQuery): Promise<Paginated<ReportRow>>;
  findById(id: string): Promise<ReportRow | null>;
}
