import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MEAL_TIMES,
  MEAL_TIME_LABELS,
  WEEK_DAYS,
  WEEK_DAY_LABELS,
  type MealTime,
  type WeekDay,
} from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { catalogApi } from '@/features/inventory/api';
import { recipesApi } from '@/features/recipes/api';
import { weeklyMenuApi } from './api';

/** Clave estable para ubicar la celda día×tiempo de comida×categoría. */
function slotKey(dayOfWeek: WeekDay, mealTime: MealTime, categoryId: string): string {
  return `${dayOfWeek}:${mealTime}:${categoryId}`;
}

export function WeeklyMenuPage() {
  const queryClient = useQueryClient();
  const [day, setDay] = useState<WeekDay>('MONDAY');

  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'RECIPE'],
    queryFn: () => catalogApi.categories('RECIPE'),
  });
  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ['menu', 'slots'],
    queryFn: weeklyMenuApi.listSlots,
  });

  const recipeQueries = useQueries({
    queries: (categories ?? []).map((c) => ({
      queryKey: ['recipes', 'by-category', c.id],
      queryFn: () => recipesApi.list({ page: 1, pageSize: 100, categoryId: c.id }),
      enabled: !!categories,
    })),
  });
  const recipesByCategory = new Map(
    (categories ?? []).map((c, i) => [c.id, recipeQueries[i]?.data?.items ?? []]),
  );

  const slotMap = new Map((slots ?? []).map((s) => [slotKey(s.dayOfWeek, s.mealTime, s.categoryId), s]));

  const mutation = useMutation({
    mutationFn: weeklyMenuApi.setSlot,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Menú semanal actualizado');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al guardar la celda'),
  });

  const isLoading = slotsLoading || !categories;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Menú semanal</h1>
        <p className="text-sm text-muted-foreground">
          Qué receta toca cada día, por tiempo de comida y tipo de dieta. Se repite todas las semanas
          hasta que lo cambies aquí.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {WEEK_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`border-b-2 px-3 py-2 text-sm transition-colors ${
              day === d
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {WEEK_DAY_LABELS[d]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-40 px-3 py-2 font-medium">Tiempo de comida</th>
                {categories?.map((c) => (
                  <th key={c.id} className="px-3 py-2 font-medium">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_TIMES.map((mealTime) => (
                <tr key={mealTime} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{MEAL_TIME_LABELS[mealTime]}</td>
                  {categories?.map((category) => {
                    const current = slotMap.get(slotKey(day, mealTime, category.id));
                    const recipes = recipesByCategory.get(category.id) ?? [];
                    return (
                      <td key={category.id} className="px-3 py-2">
                        <select
                          value={current?.recipeId ?? ''}
                          onChange={(e) =>
                            mutation.mutate({
                              dayOfWeek: day,
                              mealTime,
                              categoryId: category.id,
                              recipeId: e.target.value || null,
                            })
                          }
                          className="h-9 w-full min-w-[180px] rounded-md border border-input bg-transparent px-2 text-sm"
                        >
                          <option value="">Sin receta asignada</option>
                          {recipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
