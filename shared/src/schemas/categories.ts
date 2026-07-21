import { z } from 'zod';
import { CATEGORY_KINDS } from '../types/enums.js';

/** Crear categoría (RECIPE = tipos de dieta, PRODUCT = insumos, EXPENSE = gastos). */
export const categoryCreateSchema = z.object({
  kind: z.enum(CATEGORY_KINDS),
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60),
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

/** Editar: solo el nombre — el tipo (kind) no cambia una vez creada. */
export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60),
});
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
