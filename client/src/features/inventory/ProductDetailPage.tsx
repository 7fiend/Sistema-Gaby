import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, PackagePlus, PackageMinus, Pencil } from 'lucide-react';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCOP, formatDate, cn } from '@/lib/utils';
import { inventoryApi, type Movement } from './api';
import { ProductFormDialog } from './ProductFormDialog';
import { EntryDialog, AdjustmentDialog } from './StockDialogs';

const MOVEMENT_STYLE: Record<string, { label: string; className: string }> = {
  ENTRY: { label: 'Entrada', className: 'bg-accent text-accent-foreground' },
  EXIT: { label: 'Salida', className: 'bg-secondary text-secondary-foreground' },
  ADJUSTMENT_IN: { label: 'Ajuste +', className: 'bg-accent text-accent-foreground' },
  ADJUSTMENT_OUT: { label: 'Ajuste −', className: 'bg-secondary text-secondary-foreground' },
  WASTE: { label: 'Merma', className: 'bg-destructive/10 text-destructive' },
  LOSS: { label: 'Pérdida', className: 'bg-destructive/10 text-destructive' },
  EXPIRY: { label: 'Vencido', className: 'bg-destructive/10 text-destructive' },
};

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [movementsPage, setMovementsPage] = useState(1);
  const [entryOpen, setEntryOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: product } = useQuery({
    queryKey: ['products', id],
    queryFn: () => inventoryApi.get(id),
  });
  const { data: movements, isLoading: movementsLoading } = useQuery({
    queryKey: ['products', id, 'movements', movementsPage],
    queryFn: () => inventoryApi.movements(id, movementsPage),
  });

  if (!product) {
    return <p className="text-sm text-muted-foreground">Cargando producto…</p>;
  }

  const movementColumns: Column<Movement>[] = [
    { header: 'Fecha', cell: (m) => <span className="tnum text-muted-foreground">{formatDate(m.createdAt)}</span> },
    {
      header: 'Tipo',
      cell: (m) => {
        const style = MOVEMENT_STYLE[m.type] ?? { label: m.type, className: '' };
        return <Badge variant="outline" className={cn('border-transparent', style.className)}>{style.label}</Badge>;
      },
    },
    {
      header: 'Cantidad',
      className: 'text-right',
      cell: (m) => (
        <span className="tnum">
          {m.quantity} {product.unit.abbreviation}
        </span>
      ),
    },
    { header: 'Costo unit.', className: 'text-right', cell: (m) => <span className="tnum">{formatCOP(m.unitCost)}</span> },
    { header: 'Saldo', className: 'text-right', cell: (m) => <span className="tnum font-medium">{m.balanceAfter}</span> },
    { header: 'Motivo', cell: (m) => <span className="text-muted-foreground">{m.reason ?? '—'}</span> },
    { header: 'Usuario', cell: (m) => <span className="text-muted-foreground">{m.userName}</span> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/inventario')} aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">
            {product.name} <span className="tnum text-base font-normal text-muted-foreground">· {product.code}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {product.category.name} · {product.supplier?.name ?? 'sin proveedor'} · {product.location ?? 'sin ubicación'}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
          <Button variant="outline" onClick={() => setAdjustOpen(true)}>
            <PackageMinus className="size-4" /> Ajuste / merma
          </Button>
          <Button onClick={() => setEntryOpen(true)}>
            <PackagePlus className="size-4" /> Entrada
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Stock actual</p>
          <p className={cn('tnum mt-1 text-2xl font-semibold', product.currentStock <= product.minStock && 'text-warning')}>
            {product.currentStock} {product.unit.abbreviation}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Stock mínimo</p>
          <p className="tnum mt-1 text-2xl font-semibold">{product.minStock} {product.unit.abbreviation}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo promedio</p>
          <p className="tnum mt-1 text-2xl font-semibold">{formatCOP(product.avgCost)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Último costo</p>
          <p className="tnum mt-1 text-2xl font-semibold">{formatCOP(product.lastCost)}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Lotes disponibles (orden FEFO)</h2>
        {product.batches.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Sin lotes con existencias.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {product.batches.map((b) => (
              <div key={b.id} className="rounded-lg border bg-card px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{b.batchNumber}</span>
                  <span className="tnum">{b.remainingQuantity} / {b.initialQuantity} {product.unit.abbreviation}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tnum">{formatCOP(b.unitCost)} c/u</span>
                  <span className="tnum">{b.expiryDate ? `vence ${formatDate(b.expiryDate)}` : 'no perecedero'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Kardex (movimientos inmutables)</h2>
        <DataTable
          columns={movementColumns}
          data={movements}
          isLoading={movementsLoading}
          page={movementsPage}
          onPageChange={setMovementsPage}
          emptyMessage="Aún no hay movimientos"
        />
      </section>

      <ProductFormDialog open={editOpen} onOpenChange={setEditOpen} product={product} />
      <EntryDialog product={product} open={entryOpen} onOpenChange={setEntryOpen} />
      <AdjustmentDialog product={product} open={adjustOpen} onOpenChange={setAdjustOpen} />
    </div>
  );
}
