import { z } from 'zod';
import { MEAL_TIMES, WEEK_DAYS } from '../types/enums.js';

/**
 * Fase 18: asigna (o limpia, con recipeId null) la receta de una celda
 * día×tiempo de comida×categoría del menú semanal.
 */
export const weeklyMenuSlotSetSchema = z.object({
  dayOfWeek: z.enum(WEEK_DAYS),
  mealTime: z.enum(MEAL_TIMES),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  recipeId: z.string().min(1).nullable(),
});
export type WeeklyMenuSlotSetInput = z.infer<typeof weeklyMenuSlotSetSchema>;

export const menuForDateQuerySchema = z.object({
  date: z.coerce.date(),
});
export type MenuForDateQuery = z.infer<typeof menuForDateQuerySchema>;
