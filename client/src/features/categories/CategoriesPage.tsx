import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  type CategoryCreateInput,
  type CategoryKind,
  type CategoryUpdateInput,
} from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { catalogApi, type CatalogCategory } from '@/features/inventory/api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const KIND_TABS: { value: CategoryKind; label: string }[] = [
  { value: 'RECIPE', label: 'Recetas (tipos de dieta)' },
  { value: 'PRODUCT', label: 'Insumos' },
  { value: 'EXPENSE', label: 'Gastos' },
];

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CategoryKind;
  /** Si viene, el diálogo edita (kind fijo); si no, crea en el kind de la pestaña activa. */
  category?: CatalogCategory | null;
}

function CategoryFormDialog({ open, onOpenChange, kind, category }: FormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!category;

  const form = useForm<CategoryCreateInput | CategoryUpdateInput>({
    resolver: zodResolver(isEdit ? categoryUpdateSchema : categoryCreateSchema),
    defaultValues: isEdit ? { name: '' } : { kind, name: '' },
  });

  useEffect(() => {
    if (open) form.reset(isEdit ? { name: category?.name ?? '' } : { kind, name: '' });
  }, [open, isEdit, category, kind, form]);

  const mutation = useMutation({
    mutationFn: (values: CategoryCreateInput | CategoryUpdateInput) =>
      category
        ? catalogApi.updateCategory(category.id, values as CategoryUpdateInput)
        : catalogApi.createCategory(values as CategoryCreateInput),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] });
      toast.success(category ? 'Categoría actualizada' : 'Categoría creada');
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al guardar la categoría'),
  });

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? `Editar ${category.name}` : 'Nueva categoría'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-name">Nombre</Label>
            <Input
              id="cat-name"
              autoFocus
              placeholder="Ej. Dieta líquida"
              {...form.register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {category ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CategoryKind>('RECIPE');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogCategory | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ['catalog', 'categories', kind],
    queryFn: () => catalogApi.categories(kind),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => catalogApi.deactivateCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] });
      toast.success('Categoría desactivada');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al desactivar la categoría'),
  });

  const filtered = (categories ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const columns: Column<CatalogCategory>[] = [
    { header: 'Nombre', cell: (c) => c.name },
    {
      header: '',
      className: 'text-right w-10',
      cell: (c) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`¿Desactivar la categoría "${c.name}"?`)) deactivateMutation.mutate(c.id);
          }}
          aria-label="Desactivar"
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Categorías</h1>
        <p className="text-sm text-muted-foreground">
          Tipos de dieta (recetas), insumos y gastos. Crea las que necesite el cliente.
        </p>
      </div>

      <div className="mb-3 flex gap-1 border-b">
        {KIND_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setKind(t.value)}
            className={`border-b-2 px-3 py-2 text-sm transition-colors ${
              kind === t.value
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={{
          items: filtered,
          total: filtered.length,
          page: 1,
          pageSize: filtered.length || 1,
          totalPages: 1,
        }}
        isLoading={isLoading}
        page={1}
        onPageChange={() => {}}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar categoría…"
        onRowClick={(c) => {
          setEditing(c);
          setFormOpen(true);
        }}
        emptyMessage="No hay categorías de este tipo todavía"
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Nueva categoría
          </Button>
        }
      />

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} kind={kind} category={editing} />
    </div>
  );
}
