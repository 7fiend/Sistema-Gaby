import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { MEAL_TIMES, MEAL_TIME_LABELS } from '@gaby/shared';
import { todayISO } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { weeklyMenuApi } from './api';

export function TodayMenuPage() {
  const [date, setDate] = useState(todayISO());

  const { data: menu, isLoading } = useQuery({
    queryKey: ['menu', 'today', date],
    queryFn: () => weeklyMenuApi.today(date),
    enabled: !!date,
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Menú de hoy</h1>
          <p className="text-sm text-muted-foreground">
            Qué receta toca por tiempo de comida y dieta, según el menú semanal, y si hay
            inventario suficiente para prepararla.
          </p>
        </div>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
          aria-label="Fecha"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {MEAL_TIMES.map((mealTime) => {
            const items = (menu ?? []).filter((m) => m.mealTime === mealTime);
            if (items.length === 0) return null;
            return (
              <section key={mealTime} className="rounded-lg border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold">{MEAL_TIME_LABELS[mealTime]}</h2>
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <div
                      key={item.categoryId}
                      className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                    >
                      <span className="w-36 shrink-0 text-sm text-muted-foreground">
                        {item.categoryName}
                      </span>
                      {item.recipeId ? (
                        <>
                          <span className="text-sm font-medium">{item.recipeName}</span>
                          {item.hasStock ? (
                            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-primary">
                              <CheckCircle2 className="size-3.5" /> Hay stock
                            </span>
                          ) : (
                            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-destructive">
                              <TriangleAlert className="size-3.5" /> Sin stock suficiente
                            </span>
                          )}
                          {!item.hasStock && item.suggestion && (
                            <span className="w-full text-xs text-muted-foreground">
                              Sugerencia: <span className="font-medium">{item.suggestion.recipeName}</span>{' '}
                              sí tiene inventario completo en esta misma categoría.
                            </span>
                          )}
                          {!item.hasStock && !item.suggestion && (
                            <span className="w-full text-xs text-muted-foreground">
                              No hay otra receta de esta categoría con inventario completo.
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Sin receta asignada en el menú semanal
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {(menu ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay categorías de dieta activas o no hay menú semanal configurado todavía.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
