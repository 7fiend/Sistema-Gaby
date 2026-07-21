import type { MealTime, WeekDay, WeeklyMenuSlotSetInput } from '@gaby/shared';
import { api } from '@/lib/api';

export interface WeeklyMenuSlot {
  id: string;
  dayOfWeek: WeekDay;
  mealTime: MealTime;
  categoryId: string;
  categoryName: string;
  recipeId: string;
  recipeName: string;
}

export interface MenuSlotForDate {
  mealTime: MealTime;
  categoryId: string;
  categoryName: string;
  recipeId: string | null;
  recipeName: string | null;
  /** null = celda sin receta asignada en el menú semanal (falta configurar esa celda). */
  hasStock: boolean | null;
  suggestion: { recipeId: string; recipeName: string } | null;
}

export const weeklyMenuApi = {
  listSlots: () => api.get<WeeklyMenuSlot[]>('/menu/slots'),
  setSlot: (input: WeeklyMenuSlotSetInput) => api.put('/menu/slots', input),
  today: (date: string) => api.get<MenuSlotForDate[]>(`/menu/today?date=${date}`),
};
