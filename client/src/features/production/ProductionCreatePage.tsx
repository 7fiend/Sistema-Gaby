import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, TriangleAlert } from 'lucide-react';
import {
  MEAL_TIMES,
  MEAL_TIME_LABELS,
  productionCreateSchema,
  type MealTime,
  type ProductionCreateInput,
  type ProductionItemInput,
} from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { formatCOP, formatQty, todayISO } from '@/lib/utils';
import { catalogApi, inventoryApi } from '@/features/inventory/api';
import { recipesApi } from '@/features/recipes/api';
import { weeklyMenuApi } from '@/features/weeklyMenu/api';
import { productionApi } from './api';
import { estimateExplosion } from './explosionEstimate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Clave estable de celda de la matriz: tiempo de comida × categoría. */
function cellKey(mealTime: MealTime, categoryId: string): string {
  return `${mealTime}:${categoryId}`;
}

interface FormValues {
  date: string;
  notes: string;
  manualItems: Partial<ProductionItemInput>[];
}

export function ProductionCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Selección por celda: qué receta quedó activa para esa celda (asignada,
  // sugerida como alternativa, o elegida a mano si la celda no tenía asignación).
  const [cellRecipe, setCellRecipe] = useState<Record<string, string>>({});
  const [cellPortions, setCellPortions] = useState<Record<string, string>>({});

  const { data: recipes } = useQuery({
    queryKey: ['recipes', 'all'],
    queryFn: () => recipesApi.list({ page: 1, pageSize: 100 }),
  });
  const { data: products } = useQuery({
    queryKey: ['products', 'all-100'],
    queryFn: () => inventoryApi.list({ page: 1, pageSize: 100 }),
  });
  const { data: units } = useQuery({ queryKey: ['catalog', 'units'], queryFn: catalogApi.units });
  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'RECIPE'],
    queryFn: () => catalogApi.categories('RECIPE'),
  });

  const form = useForm<FormValues>({
    defaultValues: { date: todayISO(), notes: '', manualItems: [] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'manualItems' });
  const watched = form.watch();

  const { data: menu } = useQuery({
    queryKey: ['menu', 'today', watched.date],
    queryFn: () => weeklyMenuApi.today(watched.date),
    enabled: !!watched.date,
  });

  // Al cambiar la fecha (o cargar por primera vez) reinicia la matriz con lo
  // que diga el menú semanal para ese día — celdas sin asignación quedan
  // vacías para elegir manualmente (decisión: no bloquear la orden).
  useEffect(() => {
    if (!menu) return;
    const recipeInit: Record<string, string> = {};
    for (const item of menu) {
      recipeInit[cellKey(item.mealTime, item.categoryId)] = item.recipeId ?? '';
    }
    setCellRecipe(recipeInit);
    setCellPortions({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  // Recetas activas por categoría, para las celdas sin asignación (respaldo manual).
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

  // Items resueltos de la matriz (celda con receta elegida + porciones > 0).
  const matrixItems: ProductionItemInput[] = [];
  for (const mealTime of MEAL_TIMES) {
    for (const category of categories ?? []) {
      const key = cellKey(mealTime, category.id);
      const recipeId = cellRecipe[key];
      const portions = Number(cellPortions[key]) || 0;
      if (recipeId && portions > 0) matrixItems.push({ recipeId, portions });
    }
  }
  const manualItems: ProductionItemInput[] = (watched.manualItems ?? [])
    .filter((i): i is ProductionItemInput => !!i.recipeId && Number(i.portions) > 0)
    .map((i) => ({ recipeId: i.recipeId, portions: Number(i.portions) }));

  // Une matriz + sueltas; si coinciden en la misma receta, suma porciones.
  const mergedMap = new Map<string, number>();
  for (const item of [...matrixItems, ...manualItems]) {
    mergedMap.set(item.recipeId, (mergedMap.get(item.recipeId) ?? 0) + item.portions);
  }
  const allItems: ProductionItemInput[] = [...mergedMap].map(([recipeId, portions]) => ({
    recipeId,
    portions,
  }));

  const detailQueries = useQueries({
    queries: allItems.map((i) => ({
      queryKey: ['recipes', i.recipeId],
      queryFn: () => recipesApi.get(i.recipeId),
      enabled: !!i.recipeId,
    })),
  });
  const explosion = estimateExplosion(allItems, detailQueries.map((q) => q.data), products?.items, units);
  const shortages = explosion.filter((l) => l.missing > 0);

  const estimatedCost = allItems.reduce((sum, item) => {
    const recipe = recipes?.items.find((r) => r.id === item.recipeId);
    return sum + (recipe ? recipe.costPerPortion * item.portions : 0);
  }, 0);

  const mutation = useMutation({
    mutationFn: (values: ProductionCreateInput) => productionApi.create(values),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['production'] });
      toast.success(`Orden ${order.orderNumber} creada como borrador`);
      navigate(`/admin/produccion/${order.id}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al crear la orden'),
  });

  const handleCreate = () => {
    const parsed = productionCreateSchema.safeParse({
      date: watched.date,
      notes: watched.notes,
      items: allItems,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Agrega al menos una receta con porciones');
      return;
    }
    mutation.mutate(parsed.data);
  };

  const menuByCell = new Map((menu ?? []).map((m) => [cellKey(m.mealTime, m.categoryId), m]));

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/produccion')} aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Nueva orden de producción</h1>
          <p className="text-sm text-muted-foreground">
            La orden nace como borrador; al confirmarla se congelan costos e insumos.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <section className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-date">Fecha de producción</Label>
            <Input id="p-date" type="date" {...form.register('date')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-notes">Notas (opcional)</Label>
            <Input id="p-notes" placeholder="Observaciones del día…" {...form.register('notes')} />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">Menú del día por tiempo de comida y dieta</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Según el menú semanal para ese día. Ingresa cuántas porciones se van a producir de cada
            una; deja en 0 lo que no aplique ese día.
          </p>
          <div className="flex flex-col gap-4">
            {MEAL_TIMES.map((mealTime) => {
              const rowCategories = categories ?? [];
              if (rowCategories.length === 0) return null;
              return (
                <div key={mealTime}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {MEAL_TIME_LABELS[mealTime]}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {rowCategories.map((category) => {
                      const key = cellKey(mealTime, category.id);
                      const slot = menuByCell.get(key);
                      const chosen = cellRecipe[key] ?? '';
                      const fallbackRecipes = recipesByCategory.get(category.id) ?? [];

                      return (
                        <div key={category.id} className="grid grid-cols-[130px_1fr_110px] items-start gap-2">
                          <span className="pt-2 text-sm text-muted-foreground">{category.name}</span>

                          {slot?.recipeId ? (
                            <div className="flex flex-col gap-1">
                              {slot.hasStock === false && slot.suggestion ? (
                                <select
                                  value={chosen}
                                  onChange={(e) =>
                                    setCellRecipe((r) => ({ ...r, [key]: e.target.value }))
                                  }
                                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                                >
                                  <option value={slot.recipeId}>{slot.recipeName} (sin stock)</option>
                                  <option value={slot.suggestion.recipeId}>
                                    {slot.suggestion.recipeName} (sugerida — con stock)
                                  </option>
                                </select>
                              ) : (
                                <span className="pt-2 text-sm font-medium">{slot.recipeName}</span>
                              )}
                              {slot.hasStock === false && !slot.suggestion && (
                                <span className="flex items-center gap-1 text-xs text-destructive">
                                  <TriangleAlert className="size-3.5" /> Sin stock suficiente y sin
                                  alternativa en esta categoría
                                </span>
                              )}
                            </div>
                          ) : (
                            <select
                              value={chosen}
                              onChange={(e) => setCellRecipe((r) => ({ ...r, [key]: e.target.value }))}
                              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                            >
                              <option value="">Sin receta asignada — elegir manualmente…</option>
                              {fallbackRecipes.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          )}

                          <Input
                            type="number"
                            min={0}
                            placeholder="Porciones"
                            value={cellPortions[key] ?? ''}
                            onChange={(e) => setCellPortions((p) => ({ ...p, [key]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recetas sueltas (casos especiales)</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ recipeId: '', portions: 0 })}
            >
              <Plus className="size-4" /> Agregar receta
            </Button>
          </div>
          {fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Usa esto solo para recetas fuera del menú semanal (eventos, encargos puntuales).
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-[1fr_120px_36px] items-center gap-2">
                  <select
                    {...form.register(`manualItems.${i}.recipeId`)}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">Receta…</option>
                    {recipes?.items.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <Input type="number" min={1} placeholder="Porciones" {...form.register(`manualItems.${i}.portions`)} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(i)}
                    aria-label="Quitar"
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {allItems.length > 0 && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold">Explosión estimada de insumos</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Ingredientes consolidados entre recetas, convertidos a la unidad base de cada producto.
              La definitiva se congela al confirmar.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Producto</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Requerido</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Disponible</th>
                    <th className="py-1.5 text-right font-medium">Faltante</th>
                  </tr>
                </thead>
                <tbody>
                  {explosion.map((l) => (
                    <tr key={l.productId} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">
                        {l.productName} <span className="text-xs text-muted-foreground">({l.productCode})</span>
                      </td>
                      <td className="tnum py-1.5 pr-2 text-right">
                        {formatQty(l.required)} {l.unitAbbreviation}
                      </td>
                      <td className="tnum py-1.5 pr-2 text-right text-muted-foreground">
                        {formatQty(l.available)} {l.unitAbbreviation}
                      </td>
                      <td className="tnum py-1.5 text-right">
                        {l.missing > 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-destructive">
                            <TriangleAlert className="size-3.5" /> {formatQty(l.missing)} {l.unitAbbreviation}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo estimado</p>
            <p className="tnum text-lg font-semibold">{formatCOP(estimatedCost)}</p>
          </div>
          {shortages.length > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-warning">
              <TriangleAlert className="size-4" />
              {shortages.length} insumo{shortages.length > 1 ? 's' : ''} con stock insuficiente — se advertirá al confirmar
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/admin/produccion')}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={mutation.isPending}>
              Crear borrador
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
