import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { saleRecordSchema, type SaleRecordInput } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { formatCOP, formatDateOnly, todayISO } from '@/lib/utils';
import { recipesApi } from '@/features/recipes/api';
import { salesApi } from './api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SaleRecord } from './api';

/** Captura rápida de las ventas de un día sin registro previo. */
function SalesCaptureForm({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const { data: recipes } = useQuery({
    queryKey: ['recipes', 'all'],
    queryFn: () => recipesApi.list({ page: 1, pageSize: 100 }),
  });

  const form = useForm<SaleRecordInput>({
    resolver: zodResolver(saleRecordSchema),
    defaultValues: {
      date: date as unknown as Date,
      notes: '',
      items: [{ recipeId: '', portions: 0, unitPrice: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  // La fecha la fija el selector de la página, no el formulario
  useEffect(() => {
    form.setValue('date', date as unknown as Date);
  }, [date, form]);

  const watched = form.watch();
  const totals = (watched.items ?? []).reduce(
    (acc, i) => ({
      portions: acc.portions + (Number(i.portions) || 0),
      amount: acc.amount + (Number(i.portions) || 0) * (Number(i.unitPrice) || 0),
    }),
    { portions: 0, amount: 0 },
  );

  const mutation = useMutation({
    mutationFn: (values: SaleRecordInput) => salesApi.register(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Ventas del día registradas');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al registrar las ventas'),
  });

  const { errors } = form.formState;

  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
      noValidate
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Captura rápida — {formatDateOnly(`${date}T00:00:00Z`)}</h2>
          <p className="text-xs text-muted-foreground">
            El precio se precarga con el precio de venta de la receta (o el sugerido, si aún no
            tiene uno fijado); ajústalo si vendiste a otro valor.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ recipeId: '', portions: 0, unitPrice: 0 })}
        >
          <Plus className="size-4" /> Agregar receta
        </Button>
      </div>

      {typeof errors.items?.message === 'string' && (
        <p className="text-xs text-destructive">{errors.items.message}</p>
      )}
      {typeof errors.items?.root?.message === 'string' && (
        <p className="text-xs text-destructive">{errors.items.root.message}</p>
      )}

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_110px_150px_120px_36px] gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span>Receta</span>
          <span className="text-right">Porciones</span>
          <span className="text-right">Precio unitario</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {fields.map((field, i) => {
          const row = watched.items?.[i];
          const rowTotal = (Number(row?.portions) || 0) * (Number(row?.unitPrice) || 0);
          return (
            <div key={field.id} className="grid grid-cols-[1fr_110px_150px_120px_36px] items-center gap-2">
              <select
                {...form.register(`items.${i}.recipeId`, {
                  onChange: (e) => {
                    const recipe = recipes?.items.find((r) => r.id === e.target.value);
                    if (recipe && !(Number(row?.unitPrice) > 0)) {
                      form.setValue(`items.${i}.unitPrice`, recipe.sellingPrice ?? recipe.suggestedPrice);
                    }
                  },
                })}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Receta…</option>
                {recipes?.items.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <Input type="number" min={1} className="text-right" {...form.register(`items.${i}.portions`)} />
              <Input type="number" min={0} step={50} className="text-right" {...form.register(`items.${i}.unitPrice`)} />
              <span className="tnum text-right text-sm">{formatCOP(rowTotal)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                aria-label="Quitar"
                disabled={fields.length === 1}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="s-notes">Notas (opcional)</Label>
        <Input id="s-notes" placeholder="Observaciones del día…" {...form.register('notes')} />
      </div>

      <div className="flex flex-wrap items-center gap-6 border-t pt-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Porciones</p>
          <p className="tnum text-lg font-semibold">{totals.portions}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total del día</p>
          <p className="tnum text-lg font-semibold text-primary">{formatCOP(totals.amount)}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Un solo registro por fecha: revisa antes de guardar (las correcciones quedan en auditoría).
        </p>
        <Button type="submit" className="ml-auto" disabled={mutation.isPending}>
          Registrar ventas del día
        </Button>
      </div>
    </form>
  );
}

/** Registro existente del día seleccionado (solo lectura). */
function SalesDayRecord({ record }: { record: SaleRecord }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">
          Ventas del {formatDateOnly(record.date)} — registradas por {record.registeredBy}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Receta</th>
              <th className="py-1.5 pr-2 text-right font-medium">Porciones</th>
              <th className="py-1.5 pr-2 text-right font-medium">Precio unitario</th>
              <th className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {record.items.map((i) => (
              <tr key={i.recipeId} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{i.recipeName}</td>
                <td className="tnum py-1.5 pr-2 text-right">{i.portions}</td>
                <td className="tnum py-1.5 pr-2 text-right">{formatCOP(i.unitPrice)}</td>
                <td className="tnum py-1.5 text-right">{formatCOP(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-6 border-t pt-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Porciones</p>
          <p className="tnum text-lg font-semibold">{record.totalPortions}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total del día</p>
          <p className="tnum text-lg font-semibold text-primary">{formatCOP(record.totalAmount)}</p>
        </div>
        {record.notes && <p className="text-sm text-muted-foreground">Notas: {record.notes}</p>}
      </div>
    </div>
  );
}

export function SalesPage() {
  const [date, setDate] = useState(todayISO());
  const [page, setPage] = useState(1);

  const { data: dayRecord, isLoading: dayLoading } = useQuery({
    queryKey: ['sales', 'day', date],
    queryFn: () => salesApi.day(date),
  });
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['sales', { page }],
    queryFn: () => salesApi.list({ page }),
  });

  const columns: Column<SaleRecord>[] = [
    { header: 'Fecha', cell: (r) => <span className="tnum">{formatDateOnly(r.date)}</span> },
    { header: 'Recetas', className: 'text-right', cell: (r) => <span className="tnum">{r.items.length}</span> },
    { header: 'Porciones', className: 'text-right', cell: (r) => <span className="tnum">{r.totalPortions}</span> },
    {
      header: 'Total',
      className: 'text-right',
      cell: (r) => <span className="tnum font-medium">{formatCOP(r.totalAmount)}</span>,
    },
    { header: 'Registrado por', cell: (r) => <span className="text-muted-foreground">{r.registeredBy}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ventas del día</h1>
          <p className="text-sm text-muted-foreground">
            Registro consolidado diario: recetas vendidas, porciones y precio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="sales-date" className="text-sm text-muted-foreground">
            Día
          </Label>
          <Input
            id="sales-date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-auto"
          />
        </div>
      </div>

      {dayLoading ? (
        <p className="text-sm text-muted-foreground">Consultando el día…</p>
      ) : dayRecord ? (
        <SalesDayRecord record={dayRecord} />
      ) : (
        <SalesCaptureForm date={date} />
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Historial</h2>
        <DataTable
          columns={columns}
          data={history}
          isLoading={historyLoading}
          page={page}
          onPageChange={setPage}
          onRowClick={(r) => setDate(r.date.slice(0, 10))}
          emptyMessage="Aún no hay ventas registradas"
        />
      </section>
    </div>
  );
}
