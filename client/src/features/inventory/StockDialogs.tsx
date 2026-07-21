import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { adjustmentSchema, type AdjustmentInput } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { formatCOP } from '@/lib/utils';
import { inventoryApi, type ProductDetail } from './api';
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

const ADJUSTMENT_LABELS: Record<AdjustmentInput['type'], string> = {
  ADJUSTMENT_IN: 'Ajuste positivo (+)',
  ADJUSTMENT_OUT: 'Ajuste negativo (−)',
  WASTE: 'Merma',
  LOSS: 'Pérdida',
  EXPIRY: 'Baja por vencimiento',
};

interface DialogProps {
  product: ProductDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Formulario de entrada: se captura el costo TOTAL de la compra (lo que trae
 * la factura/recibo) — el costo por unidad se deriva, nunca se escribe a mano. */
const entryFormSchema = z.object({
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  totalCost: z.coerce.number().positive('El costo debe ser mayor a 0'),
  batchNumber: z.string().trim().max(40).optional(),
  expiryDate: z.coerce.date().optional().nullable(),
});
type EntryFormValues = z.infer<typeof entryFormSchema>;

/** Entrada de inventario: compra/ingreso con lote y costo (recalcula promedio). */
export function EntryDialog({ product, open, onOpenChange }: DialogProps) {
  const queryClient = useQueryClient();
  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: { quantity: 0, totalCost: 0 },
  });

  const mutation = useMutation({
    mutationFn: (values: EntryFormValues) =>
      inventoryApi.registerEntry({
        productId: product.id,
        quantity: values.quantity,
        // costo unitario = total ÷ cantidad, con la misma resolución que avgCost/lastCost (4 decimales)
        unitCost: Math.round((values.totalCost / values.quantity) * 10_000) / 10_000,
        batchNumber: values.batchNumber,
        expiryDate: values.expiryDate,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Entrada registrada — costo promedio y recetas recalculados');
      onOpenChange(false);
      form.reset({ quantity: 0, totalCost: 0 });
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al registrar la entrada'),
  });

  const { errors } = form.formState;
  const [quantity, totalCost] = form.watch(['quantity', 'totalCost']);
  const unitCostPreview = quantity > 0 && totalCost > 0 ? totalCost / quantity : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrada — {product.name}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="grid grid-cols-2 gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-qty">Cantidad ({product.unit.abbreviation})</Label>
            <Input id="e-qty" type="number" step="0.001" autoFocus {...form.register('quantity')} />
            {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-cost">Costo total de la compra (COP)</Label>
            <Input id="e-cost" type="number" step="0.01" {...form.register('totalCost')} />
            {errors.totalCost && <p className="text-xs text-destructive">{errors.totalCost.message}</p>}
          </div>
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
            {unitCostPreview !== null
              ? `→ Costo unitario: ${formatCOP(unitCostPreview)} / ${product.unit.abbreviation}`
              : 'Escribe cantidad y costo total para ver el costo por unidad.'}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-batch">N.º de lote (opcional)</Label>
            <Input id="e-batch" placeholder="Se genera automático" {...form.register('batchNumber')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-expiry">Fecha de vencimiento</Label>
            <Input
              id="e-expiry"
              type="date"
              {...form.register('expiryDate', {
                setValueAs: (v: string) => (v ? new Date(v) : null),
              })}
            />
          </div>
          <DialogFooter className="col-span-2 mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Registrar entrada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ajustes y mermas: consume lotes por FEFO y queda en el kardex. */
export function AdjustmentDialog({ product, open, onOpenChange }: DialogProps) {
  const queryClient = useQueryClient();
  const form = useForm<AdjustmentInput>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { productId: product.id, type: 'WASTE', quantity: 0, reason: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: AdjustmentInput) => inventoryApi.registerAdjustment(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Movimiento registrado');
      onOpenChange(false);
      form.reset({ productId: product.id, type: 'WASTE', quantity: 0, reason: '' });
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al registrar el movimiento'),
  });

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste / merma — {product.name}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-type">Tipo</Label>
              <select
                id="a-type"
                {...form.register('type')}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {Object.entries(ADJUSTMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-qty">Cantidad ({product.unit.abbreviation})</Label>
              <Input id="a-qty" type="number" step="0.001" {...form.register('quantity')} />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-reason">Motivo (obligatorio — queda en auditoría)</Label>
            <Textarea id="a-reason" rows={2} {...form.register('reason')} />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={mutation.isPending}>
              Registrar movimiento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
