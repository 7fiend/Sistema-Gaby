import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { expenseSchema, type ExpenseInput } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { formatCOP, formatDateOnly, todayISO } from '@/lib/utils';
import { catalogApi } from '@/features/inventory/api';
import { expensesApi, type Expense } from './api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
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

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene, el diálogo edita; si no, crea. */
  expense?: Expense | null;
}

function ExpenseFormDialog({ open, onOpenChange, expense }: FormDialogProps) {
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'EXPENSE'],
    queryFn: () => catalogApi.categories('EXPENSE'),
  });

  const form = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    values: {
      categoryId: expense?.category.id ?? '',
      amount: expense?.amount ?? 0,
      date: (expense?.date.slice(0, 10) ?? todayISO()) as unknown as Date,
      description: expense?.description ?? '',
      receiptUrl: expense?.receiptUrl ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ExpenseInput) =>
      expense ? expensesApi.update(expense.id, values) : expensesApi.create(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(expense ? 'Gasto actualizado' : 'Gasto registrado');
      onOpenChange(false);
      form.reset();
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al guardar el gasto'),
  });

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="grid grid-cols-2 gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-cat">Categoría</Label>
            <select
              id="g-cat"
              {...form.register('categoryId')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Selecciona…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-date">Fecha</Label>
            <Input id="g-date" type="date" {...form.register('date')} />
            {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-amount">Monto (COP)</Label>
            <Input id="g-amount" type="number" min={0} step={50} autoFocus {...form.register('amount')} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-receipt">Soporte / factura (URL, opcional)</Label>
            <Input id="g-receipt" placeholder="https://…" {...form.register('receiptUrl')} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="g-desc">Descripción</Label>
            <Textarea id="g-desc" rows={2} {...form.register('description')} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>
          <DialogFooter className="col-span-2 mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {expense ? 'Guardar cambios' : 'Registrar gasto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', { page, search, categoryId, from, to }],
    queryFn: () =>
      expensesApi.list({
        page,
        search: search || undefined,
        categoryId: categoryId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });
  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'EXPENSE'],
    queryFn: () => catalogApi.categories('EXPENSE'),
  });

  const columns: Column<Expense>[] = [
    { header: 'Fecha', cell: (e) => <span className="tnum">{formatDateOnly(e.date)}</span> },
    { header: 'Categoría', cell: (e) => <span className="text-muted-foreground">{e.category.name}</span> },
    { header: 'Descripción', cell: (e) => e.description },
    {
      header: 'Monto',
      className: 'text-right',
      cell: (e) => <span className="tnum font-medium">{formatCOP(e.amount)}</span>,
    },
    { header: 'Registrado por', cell: (e) => <span className="text-muted-foreground">{e.createdBy}</span> },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Gastos</h1>
        <p className="text-sm text-muted-foreground">
          Gastos operativos por categoría. Toca un gasto para corregirlo (queda en auditoría).
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por descripción…"
        onRowClick={(e) => {
          setEditing(e);
          setFormOpen(true);
        }}
        emptyMessage="No hay gastos para estos filtros"
        toolbar={
          <>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Todas las categorías</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-auto"
              aria-label="Desde"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-auto"
              aria-label="Hasta"
            />
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Nuevo gasto
            </Button>
          </>
        }
      />

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} />
    </div>
  );
}
