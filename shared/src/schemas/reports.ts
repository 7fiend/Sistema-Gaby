import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from './common.js';
import { REPORT_FORMATS } from '../types/enums.js';

/** Los 9 tipos de RF-12.1. `inventory_value` ignora el rango (es una foto del momento). */
export const REPORT_TYPES = [
  'sales',
  'production',
  'expenses',
  'profit',
  'inventory_value',
  'waste',
  'recipe_profitability',
  'top_recipes',
  'top_ingredients',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const reportRangeQuerySchema = dateRangeSchema;
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const reportExportSchema = dateRangeSchema.and(z.object({ format: z.enum(REPORT_FORMATS) }));
export type ReportExportInput = z.infer<typeof reportExportSchema>;

export const reportsQuerySchema = paginationSchema.extend({
  type: z.enum(REPORT_TYPES).optional(),
});
export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export interface ReportColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
}

/** Forma genérica que produce cualquier tipo de reporte — un solo exportador por formato. */
export interface ReportResult {
  type: ReportType;
  from: string;
  to: string;
  generatedAt: string;
  title: string;
  /** Aviso al usuario cuando el rango no aplica tal cual (ej. inventory_value). */
  notes?: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  /** Fila de totales, opcional. */
  summary?: Record<string, string | number>;
}

export interface ReportRecord {
  id: string;
  type: ReportType;
  format: (typeof REPORT_FORMATS)[number];
  params: unknown;
  createdBy: string;
  createdAt: string;
}
