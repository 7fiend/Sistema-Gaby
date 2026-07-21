import { z } from 'zod';
import { PRODUCTION_STATUS } from '../types/enums.js';
import { paginationSchema } from './common.js';

/** Item de una orden: receta × porciones a producir. */
export const productionItemSchema = z.object({
  recipeId: z.string().min(1, 'Selecciona una receta'),
  portions: z.coerce.number().int().positive('Las porciones deben ser mayores a 0'),
});
export type ProductionItemInput = z.infer<typeof productionItemSchema>;

/** Crear orden de producción (nace en DRAFT). */
export const productionCreateSchema = z.object({
  date: z.coerce.date(),
  notes: z.string().trim().max(300).optional().nullable(),
  items: z
    .array(productionItemSchema)
    .min(1, 'Agrega al menos una receta')
    .refine(
      (items) => new Set(items.map((i) => i.recipeId)).size === items.length,
      'Cada receta solo puede aparecer una vez',
    ),
});
export type ProductionCreateInput = z.infer<typeof productionCreateSchema>;

export const productionQuerySchema = paginationSchema.extend({
  status: z.enum(PRODUCTION_STATUS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ProductionQuery = z.infer<typeof productionQuerySchema>;
