import { z } from 'zod';
import { paginationSchema } from './common.js';

export const recipeIngredientSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  unitId: z.string().min(1, 'Selecciona la unidad'),
});
export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;

export const recipeStepSchema = z.string().trim().min(3, 'Paso muy corto').max(500);

/** Crear receta: info + ingredientes + pasos (versión 1). */
export const recipeCreateSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  description: z.string().trim().max(500).optional().nullable(),
  prepTimeMinutes: z.coerce.number().int().min(0).default(0),
  yieldPortions: z.coerce.number().int().positive('Debe rendir al menos 1 porción'),
  targetMarginPct: z.coerce.number().min(0).max(95).default(60),
  /** Precio real de venta, fijado a mano por el dueño — independiente del margen objetivo. */
  sellingPrice: z.coerce.number().positive('Debe ser mayor a 0').optional().nullable(),
  imageUrl: z.string().trim().max(300).optional().nullable(),
  ingredients: z.array(recipeIngredientSchema).min(1, 'Agrega al menos un ingrediente'),
  steps: z.array(recipeStepSchema).default([]),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;

/** Editar información general (NO toca ingredientes: eso es una revisión). */
export const recipeUpdateSchema = recipeCreateSchema
  .omit({ ingredients: true, steps: true, notes: true })
  .partial();
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;

/** Revisar receta: nueva versión con ingredientes y pasos (RF-02.5). */
export const recipeReviseSchema = z.object({
  ingredients: z.array(recipeIngredientSchema).min(1, 'Agrega al menos un ingrediente'),
  steps: z.array(recipeStepSchema).default([]),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type RecipeReviseInput = z.infer<typeof recipeReviseSchema>;

export const recipesQuerySchema = paginationSchema.extend({
  categoryId: z.string().optional(),
  includeInactive: z.coerce.boolean().optional(),
});
export type RecipesQuery = z.infer<typeof recipesQuerySchema>;
