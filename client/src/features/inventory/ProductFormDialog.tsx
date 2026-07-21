import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { productSchema, type ProductInput } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { catalogApi, inventoryApi, type Product } from './api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene, es edición; si no, creación. */
  product?: Product;
}

const emptyValues: ProductInput = {
  code: '',
  name: '',
  categoryId: '',
  supplierId: null,
  unitId: '',
  minStock: 0,
  location: '',
  isWeighable: true,
  toleranceKg: null,
  usageType: 'RECIPE',
};

export function ProductFormDialog({ open, onOpenChange, product }: Props) {
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'PRODUCT'],
    queryFn: () => catalogApi.categories('PRODUCT'),
  });
  const { data: units } = useQuery({ queryKey: ['catalog', 'units'], queryFn: catalogApi.units });
  const { data: suppliers } = useQuery({
    queryKey: ['catalog', 'suppliers'],
    queryFn: catalogApi.suppliers,
  });

  const form = useForm<ProductInput>({ resolver: zodResolver(productSchema), defaultValues: emptyValues });

  useEffect(() => {
    if (open) {
      form.reset(
        product
          ? {
              code: product.code,
              name: product.name,
              categoryId: product.category.id,
              supplierId: product.supplier?.id ?? null,
              unitId: product.unit.id,
              minStock: product.minStock,
              location: product.location ?? '',
              isWeighable: product.isWeighable,
              toleranceKg: product.toleranceKg,
              usageType: product.usageType,
            }
          : emptyValues,
      );
    }
  }, [open, product, form]);

  const mutation = useMutation({
    mutationFn: (values: ProductInput) =>
      product ? inventoryApi.update(product.id, values) : inventoryApi.create(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(product ? 'Producto actualizado' : 'Producto creado');
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al guardar el producto'),
  });

  const { errors, isSubmitting } = form.formState;
  const field = (name: keyof ProductInput) =>
    errors[name] && <p className="text-xs text-destructive">{errors[name]?.message as string}</p>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? `Editar ${product.name}` : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="grid grid-cols-2 gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Código</Label>
            <Input id="code" {...form.register('code')} placeholder="CAR-004" />
            {field('code')}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" {...form.register('name')} />
            {field('name')}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoryId">Categoría</Label>
            <select
              id="categoryId"
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
            {field('categoryId')}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unitId">Unidad base</Label>
            <select
              id="unitId"
              {...form.register('unitId')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Selecciona…</option>
              {units?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
            {field('unitId')}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplierId">Proveedor</Label>
            <select
              id="supplierId"
              {...form.register('supplierId')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Sin proveedor</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minStock">Stock mínimo</Label>
            <Input id="minStock" type="number" step="0.001" {...form.register('minStock')} />
            {field('minStock')}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Ubicación</Label>
            <Input id="location" {...form.register('location')} placeholder="Bodega principal" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="toleranceKg">Tolerancia báscula (kg)</Label>
            <Input
              id="toleranceKg"
              type="number"
              step="0.001"
              placeholder="Global (±0,050)"
              {...form.register('toleranceKg', {
                setValueAs: (v: string) => (v === '' ? null : Number(v)),
              })}
            />
            {field('toleranceKg')}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usageType">Tipo de consumo</Label>
            <select
              id="usageType"
              {...form.register('usageType')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="RECIPE">Insumo de cocina (receta/báscula)</option>
              <option value="ROUTINE">Aseo (registro manual diario)</option>
            </select>
          </div>

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('isWeighable')} className="size-4 accent-primary" />
            Se entrega por peso (báscula). Desmarca para conteo por unidad.
          </label>

          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {product ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
