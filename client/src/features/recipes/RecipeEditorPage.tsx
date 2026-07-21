import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { recipeCreateSchema, type RecipeCreateInput } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { formatCOP } from '@/lib/utils';
import { catalogApi, inventoryApi } from '@/features/inventory/api';
import { recipesApi } from './api';
import { estimateRecipeCost, parseSteps } from './costEstimate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function RecipeEditorPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stepsText, setStepsText] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'RECIPE'],
    queryFn: () => catalogApi.categories('RECIPE'),
  });
  const { data: units } = useQuery({ queryKey: ['catalog', 'units'], queryFn: catalogApi.units });
  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => inventoryApi.list({ page: 1 }),
  });

  const form = useForm<RecipeCreateInput>({
    resolver: zodResolver(recipeCreateSchema),
    defaultValues: {
      name: '',
      categoryId: '',
      description: '',
      prepTimeMinutes: 0,
      yieldPortions: 10,
      targetMarginPct: 60,
      ingredients: [{ productId: '', quantity: 0, unitId: '' }],
      steps: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'ingredients' });

  const watched = form.watch();
  const estimate = estimateRecipeCost(
    watched.ingredients ?? [],
    Number(watched.yieldPortions) || 0,
    Number(watched.targetMarginPct) || 0,
    products?.items,
    units,
  );

  const mutation = useMutation({
    mutationFn: (values: RecipeCreateInput) => recipesApi.create(values),
    onSuccess: (recipe) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Receta creada con sus costos calculados');
      navigate(`/admin/recetas/${recipe.id}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al crear la receta'),
  });

  const onSubmit = form.handleSubmit((values) =>
    mutation.mutate({ ...values, steps: parseSteps(stepsText) }),
  );

  const { errors } = form.formState;

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/recetas')} aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold">Nueva receta</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <section className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="r-name">Nombre</Label>
            <Input id="r-name" {...form.register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-cat">Categoría</Label>
            <select
              id="r-cat"
              {...form.register('categoryId')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Selecciona…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-yield">Rendimiento (porciones)</Label>
            <Input id="r-yield" type="number" {...form.register('yieldPortions')} />
            {errors.yieldPortions && <p className="text-xs text-destructive">{errors.yieldPortions.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-time">Tiempo (min)</Label>
            <Input id="r-time" type="number" {...form.register('prepTimeMinutes')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-margin">Margen objetivo (%)</Label>
            <Input id="r-margin" type="number" {...form.register('targetMarginPct')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-price">Precio de venta (COP, opcional)</Label>
            <Input id="r-price" type="number" step="0.01" placeholder="Puedes fijarlo después" {...form.register('sellingPrice')} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="r-desc">Descripción</Label>
            <Textarea id="r-desc" rows={2} {...form.register('description')} />
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ingredientes (por lote de rendimiento)</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: '', quantity: 0, unitId: '' })}>
              <Plus className="size-4" /> Agregar
            </Button>
          </div>
          {typeof errors.ingredients?.message === 'string' && (
            <p className="mb-2 text-xs text-destructive">{errors.ingredients.message}</p>
          )}
          <div className="flex flex-col gap-2">
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[1fr_110px_130px_36px] items-center gap-2">
                <select
                  {...form.register(`ingredients.${i}.productId`)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Producto…</option>
                  {products?.items.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Input type="number" step="0.001" placeholder="Cant." {...form.register(`ingredients.${i}.quantity`)} />
                <select
                  {...form.register(`ingredients.${i}.unitId`)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Unidad…</option>
                  {units?.map((u) => (
                    <option key={u.id} value={u.id}>{u.abbreviation}</option>
                  ))}
                </select>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Quitar" disabled={fields.length === 1}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Pasos de preparación (uno por línea)</h2>
          <Textarea
            rows={5}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={'Alistar y pesar ingredientes.\nPreparar la proteína…'}
          />
        </section>

        <section className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo lote</p>
            <p className="tnum text-lg font-semibold">{formatCOP(estimate.total)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo/porción</p>
            <p className="tnum text-lg font-semibold">{formatCOP(estimate.perPortion)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio sugerido</p>
            <p className="tnum text-lg font-semibold text-primary">{formatCOP(estimate.price)}</p>
          </div>
          <p className="basis-full text-xs text-muted-foreground">
            Estimación en vivo con los costos promedio actuales — el servidor fija los valores definitivos.
          </p>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/admin/recetas')}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>Crear receta</Button>
          </div>
        </section>
      </form>
    </div>
  );
}
