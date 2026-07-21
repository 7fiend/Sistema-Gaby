import { z } from 'zod';
import { paginationSchema } from './common.js';

/** Item vendido: receta × porciones × precio unitario. */
export const saleItemSchema = z.object({
  recipeId: z.string().min(1, 'Selecciona una receta'),
  portions: z.coerce.number().int().positive('Las porciones deben ser mayores a 0'),
  unitPrice: z.coerce.number().min(0, 'El precio no puede ser negativo'),
});
export type SaleItemInput = z.infer<typeof saleItemSchema>;

/**
 * Registro consolidado de ventas del día (decisión cliente §6.1):
 * un solo registro por fecha; el total de cada item lo calcula el servidor.
 */
export const saleRecordSchema = z.object({
  date: z.coerce.date(),
  notes: z.string().trim().max(300).optional().nullable(),
  items: z
    .array(saleItemSchema)
    .min(1, 'Agrega al menos una receta vendida')
    .refine(
      (items) => new Set(items.map((i) => i.recipeId)).size === items.length,
      'Cada receta solo puede aparecer una vez',
    ),
});
export type SaleRecordInput = z.infer<typeof saleRecordSchema>;

export const salesQuerySchema = paginationSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type SalesQuery = z.infer<typeof salesQuerySchema>;
