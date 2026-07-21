import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { ArrowLeft, GitBranchPlus, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recipeReviseSchema, type RecipeReviseInput } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { cn, formatCOP, formatDate } from '@/lib/utils';
import { catalogApi, inventoryApi } from '@/features/inventory/api';
import { recipesApi, type RecipeDetail } from './api';
import { estimateRecipeCost, parseSteps } from './costEstimate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Nueva versión de ingredientes/pasos (RF-02.5). */
function ReviseDialog({
  recipe,
  open,
  onOpenChange,
}: {
  recipe: RecipeDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [stepsText, setStepsText] = useState(recipe.steps.join('\n'));
  const { data: units } = useQuery({ queryKey: ['catalog', 'units'], queryFn: catalogApi.units });
  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => inventoryApi.list({ page: 1 }),
  });

  const form = useForm<RecipeReviseInput>({
    resolver: zodResolver(recipeReviseSchema),
    defaultValues: {
      ingredients: recipe.ingredients.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitId: i.unit.id,
      })),
      steps: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'ingredients' });

  const watched = form.watch();
  const estimate = estimateRecipeCost(
    watched.ingredients ?? [],
    recipe.yieldPortions,
    recipe.targetMarginPct,
    products?.items,
    units,
  );

  const mutation = useMutation({
    mutationFn: (values: RecipeReviseInput) => recipesApi.revise(recipe.id, values),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success(`Versión ${updated.currentVersionNumber} creada — el histórico queda intacto`);
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al crear la versión'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Nueva versión de {recipe.name} (actual: v{recipe.currentVersionNumber})
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate({ ...v, steps: parseSteps(stepsText) }))}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-2">
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[1fr_110px_120px_36px] items-center gap-2">
                <select
                  {...form.register(`ingredients.${i}.productId`)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Producto…</option>
                  {products?.items.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Input type="number" step="0.001" {...form.register(`ingredients.${i}.quantity`)} />
                <select
                  {...form.register(`ingredients.${i}.unitId`)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {units?.map((u) => (
                    <option key={u.id} value={u.id}>{u.abbreviation}</option>
                  ))}
                </select>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1} aria-label="Quitar">
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => append({ productId: '', quantity: 0, unitId: '' })}
            >
              <Plus className="size-4" /> Agregar ingrediente
            </Button>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Pasos (uno por línea)</p>
            <Textarea rows={4} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
          </div>

          <p className="tnum text-sm text-muted-foreground">
            Nuevo costo estimado: <b className="text-foreground">{formatCOP(estimate.total)}</b> ·
            por porción <b className="text-foreground">{formatCOP(estimate.perPortion)}</b>
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>Crear versión {recipe.currentVersionNumber + 1}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Precio real de venta (editable) y la ganancia/margen resultante frente al
 * costo de producción — a diferencia de "Precio sugerido" (basado en el
 * margen objetivo), esto es una decisión del dueño que el recálculo en
 * cascada de costos nunca sobrescribe. */
const sellingPriceFormSchema = z.object({
  sellingPrice: z.coerce.number().positive('Debe ser mayor a 0'),
});
type SellingPriceForm = z.infer<typeof sellingPriceFormSchema>;

function SellingPriceCard({ recipe }: { recipe: RecipeDetail }) {
  const queryClient = useQueryClient();
  const form = useForm<SellingPriceForm>({
    resolver: zodResolver(sellingPriceFormSchema),
    values: { sellingPrice: recipe.sellingPrice ?? recipe.suggestedPrice },
  });

  const mutation = useMutation({
    mutationFn: (v: SellingPriceForm) =>
      recipesApi.update(recipe.id, { sellingPrice: v.sellingPrice }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', recipe.id] });
      toast.success('Precio de venta actualizado');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al actualizar el precio'),
  });

  const watchedPrice = Number(form.watch('sellingPrice')) || 0;
  const profit = watchedPrice > 0 ? watchedPrice - recipe.costPerPortion : null;
  const marginPct = profit !== null && watchedPrice > 0 ? Math.round((profit / watchedPrice) * 100) : null;
  const { errors, isDirty } = form.formState;

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Precio de venta y rentabilidad</h2>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="flex flex-wrap items-end gap-5"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rp-price">Precio de venta por porción (COP)</Label>
          <Input id="rp-price" type="number" step="0.01" className="w-40" {...form.register('sellingPrice')} />
          {errors.sellingPrice && <p className="text-xs text-destructive">{errors.sellingPrice.message}</p>}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ganancia por porción</p>
          <p className={cn('tnum text-lg font-semibold', profit !== null && profit < 0 && 'text-destructive')}>
            {profit !== null ? formatCOP(profit) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Margen real</p>
          <p className={cn('tnum text-lg font-semibold', marginPct !== null && marginPct < 0 && 'text-destructive')}>
            {marginPct !== null ? `${marginPct}%` : '—'}
          </p>
        </div>
        <Button type="submit" disabled={mutation.isPending || !isDirty} className="ml-auto">
          Guardar precio
        </Button>
      </form>
      {recipe.sellingPrice === null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Todavía no has fijado un precio de venta — se muestra el precio sugerido (
          {formatCOP(recipe.suggestedPrice)}) como punto de partida.
        </p>
      )}
    </section>
  );
}

export function RecipeDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [reviseOpen, setReviseOpen] = useState(false);

  const { data: recipe } = useQuery({ queryKey: ['recipes', id], queryFn: () => recipesApi.get(id) });

  if (!recipe) return <p className="text-sm text-muted-foreground">Cargando receta…</p>;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/recetas')} aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">
            {recipe.name}{' '}
            <Badge variant="outline" className="tnum ml-1 align-middle">v{recipe.currentVersionNumber}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {recipe.category.name} · rinde {recipe.yieldPortions} porciones · {recipe.prepTimeMinutes} min
          </p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setReviseOpen(true)}>
            <GitBranchPlus className="size-4" /> Nueva versión
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo lote</p>
          <p className="tnum mt-1 text-2xl font-semibold">{formatCOP(recipe.currentCost)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo/porción</p>
          <p className="tnum mt-1 text-2xl font-semibold">{formatCOP(recipe.costPerPortion)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio sugerido</p>
          <p className="tnum mt-1 text-2xl font-semibold text-primary">{formatCOP(recipe.suggestedPrice)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Margen objetivo</p>
          <p className="tnum mt-1 text-2xl font-semibold">{recipe.targetMarginPct}%</p>
        </div>
      </div>

      <SellingPriceCard recipe={recipe} />

      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Ingredientes (versión vigente)</h2>
        <div className="divide-y">
          {recipe.ingredients.map((i) => (
            <div key={i.productId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="tnum text-muted-foreground">{i.productCode}</span>
              <span className="font-medium">{i.productName}</span>
              <span className="tnum ml-auto">{i.quantity} {i.unit.abbreviation}</span>
              <span className="tnum w-28 text-right text-muted-foreground">{formatCOP(i.currentCost)}</span>
            </div>
          ))}
        </div>
      </section>

      {recipe.steps.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Pasos de preparación</h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            {recipe.steps.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Historial de versiones</h2>
        <div className="flex flex-col gap-1 text-sm">
          {recipe.versions.map((v) => (
            <div key={v.versionNumber} className="flex items-center gap-3">
              <Badge variant={v.isCurrent ? 'default' : 'outline'} className="tnum">v{v.versionNumber}</Badge>
              <span className="text-muted-foreground">{formatDate(v.createdAt)} · {v.createdBy}</span>
              {v.isCurrent && <span className="text-xs text-primary">vigente</span>}
            </div>
          ))}
        </div>
      </section>

      <ReviseDialog recipe={recipe} open={reviseOpen} onOpenChange={setReviseOpen} />
    </div>
  );
}
