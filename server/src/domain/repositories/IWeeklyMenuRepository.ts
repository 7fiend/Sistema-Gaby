import type { MealTime, WeekDay, WeeklyMenuSlotSetInput } from '@gaby/shared';

export interface WeeklyMenuSlotDTO {
  id: string;
  dayOfWeek: WeekDay;
  mealTime: MealTime;
  categoryId: string;
  categoryName: string;
  recipeId: string;
  recipeName: string;
}

/** Una celda resuelta para una fecha concreta (RF Fase 18: recomendación por inventario). */
export interface MenuSlotForDate {
  mealTime: MealTime;
  categoryId: string;
  categoryName: string;
  recipeId: string | null;
  recipeName: string | null;
  /** null = celda sin receta asignada en el menú semanal (fallback manual en el frontend). */
  hasStock: boolean | null;
  /** Otra receta ACTIVA de la misma categoría con inventario completo, si la del día no alcanza. */
  suggestion: { recipeId: string; recipeName: string } | null;
}

export interface IWeeklyMenuRepository {
  /** Todas las celdas configuradas (para la grilla editable del admin). */
  listSlots(): Promise<WeeklyMenuSlotDTO[]>;
  /** Asigna la receta de una celda; recipeId null limpia la celda (queda "sin asignar"). */
  setSlot(input: WeeklyMenuSlotSetInput): Promise<void>;
  /** Menú resuelto para una fecha: día de la semana + disponibilidad + sugerencia. */
  getMenuForDate(date: Date): Promise<MenuSlotForDate[]>;
}
