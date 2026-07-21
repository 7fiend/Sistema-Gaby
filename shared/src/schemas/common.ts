import { z } from 'zod';

/** Paginación estándar para listados (paginación en servidor). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().max(60).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Rango de fechas para reportes y consultas. */
export const dateRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((r) => r.from <= r.to, { message: 'La fecha inicial debe ser anterior a la final' });
export type DateRange = z.infer<typeof dateRangeSchema>;

export const idSchema = z.string().min(1, 'Identificador requerido');

/** Envelope único de respuesta de la API. */
export interface ApiSuccess<T> {
  data: T;
}
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
