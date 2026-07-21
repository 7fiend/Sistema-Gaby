import type { Request, Response } from 'express';
import path from 'node:path';
import {
  REPORT_TYPES,
  type ReportExportInput,
  type ReportRangeQuery,
  type ReportsQuery,
  type ReportType,
} from '@gaby/shared';
import type { ReportUseCases } from '../../../application/use-cases/reports/ReportUseCases.js';
import { ValidationError } from '../../../domain/errors/AppError.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

const CONTENT_TYPE: Record<'PDF' | 'XLSX' | 'CSV', string> = {
  PDF: 'application/pdf',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv',
};

function assertType(value: string): ReportType {
  if (!(REPORT_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(`Tipo de reporte inválido: ${value}`, { allowed: REPORT_TYPES });
  }
  return value as ReportType;
}

export class ReportsController {
  constructor(private readonly reports: ReportUseCases) {}

  generate = async (req: Request, res: Response): Promise<void> => {
    const type = assertType(req.params.type as string);
    const { from, to } = validatedQuery<ReportRangeQuery>(req);
    res.json({ data: await this.reports.generate(type, from, to) });
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const type = assertType(req.params.type as string);
    const { record, filePath } = await this.reports.export(type, req.body as ReportExportInput, authUser(req));
    res.setHeader('Content-Type', CONTENT_TYPE[record.format]);
    res.download(filePath, path.basename(filePath));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.reports.list(validatedQuery<ReportsQuery>(req)) });
  };

  download = async (req: Request, res: Response): Promise<void> => {
    const record = await this.reports.download(req.params.id as string);
    res.setHeader('Content-Type', CONTENT_TYPE[record.format]);
    res.download(record.filePath, path.basename(record.filePath));
  };
}
