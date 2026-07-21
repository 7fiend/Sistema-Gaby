import { z } from 'zod';
import { PRODUCT_USAGE_TYPES } from '../types/enums.js';
import { paginationSchema } from './common.js';

/** Producto de inventario (crear/editar). */
export const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(20)
    .regex(/^[A-Z0-9-]+$/i, 'Solo letras, números y guiones'),
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  supplierId: z.string().optional().nullable(),
  unitId: z.string().min(1, 'Selecciona la unidad base'),
  minStock: z.coerce.number().min(0, 'No puede ser negativo').default(0),
  location: z.string().trim().max(60).optional().nullable(),
  isWeighable: z.boolean().default(true),
  toleranceKg: z.coerce.number().positive('Debe ser mayor a 0').optional().nullable(),
  /** Fase 18: ROUTINE (aseo) se descuenta por registro manual, nunca por báscula. */
  usageType: z.enum(PRODUCT_USAGE_TYPES).default('RECIPE'),
});
export type ProductInput = z.infer<typeof productSchema>;

/** Entrada de inventario (compra/ingreso): crea lote + movimiento ENTRY. */
export const entrySchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  unitCost: z.coerce.number().positive('El costo debe ser mayor a 0'),
  batchNumber: z.string().trim().max(40).optional(),
  expiryDate: z.coerce.date().optional().nullable(),
  reason: z.string().trim().max(200).optional(),
});
export type EntryInput = z.infer<typeof entrySchema>;

export const OUT_ADJUSTMENT_TYPES = ['ADJUSTMENT_OUT', 'WASTE', 'LOSS', 'EXPIRY'] as const;

/** Ajustes: positivo (ADJUSTMENT_IN) o salidas por merma/pérdida/vencimiento. */
export const adjustmentSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(['ADJUSTMENT_IN', ...OUT_ADJUSTMENT_TYPES]),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  reason: z.string().trim().min(3, 'Describe el motivo (mínimo 3 caracteres)').max(200),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const productsQuerySchema = paginationSchema.extend({
  categoryId: z.string().optional(),
  lowStock: z.coerce.boolean().optional(),
  includeInactive: z.coerce.boolean().optional(),
  usageType: z.enum(PRODUCT_USAGE_TYPES).optional(),
});
export type ProductsQuery = z.infer<typeof productsQuerySchema>;

export const movementsQuerySchema = paginationSchema;
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

/** Fase 18: registro diario de consumo de productos de rutina (aseo) — cantidades variables. */
export const routineConsumptionSchema = z.object({
  entries: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().min(0),
      }),
    )
    .min(1, 'Agrega al menos un producto'),
});
export type RoutineConsumptionInput = z.infer<typeof routineConsumptionSchema>;
