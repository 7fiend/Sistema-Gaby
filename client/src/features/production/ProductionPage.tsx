import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PRODUCTION_STATUS, type ProductionStatus } from '@gaby/shared';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCOP, formatDateOnly } from '@/lib/utils';
import { productionApi, type ProductionOrder } from './api';
import { STATUS_BADGE, STATUS_LABELS } from './status';

export function ProductionPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['production', { page, status, from, to }],
    queryFn: () =>
      productionApi.list({
        page,
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const columns: Column<ProductionOrder>[] = [
    { header: 'Orden', cell: (o) => <span className="tnum font-medium">{o.orderNumber}</span> },
    { header: 'Fecha', cell: (o) => <span className="tnum">{formatDateOnly(o.date)}</span> },
    {
      header: 'Estado',
      cell: (o) => (
        <Badge variant="outline" className={STATUS_BADGE[o.status]}>
          {STATUS_LABELS[o.status]}
        </Badge>
      ),
    },
    { header: 'Recetas', className: 'text-right', cell: (o) => <span className="tnum">{o.recipesCount}</span> },
    { header: 'Porciones', className: 'text-right', cell: (o) => <span className="tnum">{o.totalPortions}</span> },
    {
      header: 'Costo (snapshot)',
      className: 'text-right',
      cell: (o) => (
        <span className="tnum">
          {/* borradores y cancelaciones sin confirmar no tienen snapshot */}
          {o.totalCostSnapshot > 0 ? formatCOP(o.totalCostSnapshot) : <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    { header: 'Creada por', cell: (o) => <span className="text-muted-foreground">{o.createdBy}</span> },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Producción</h1>
        <p className="text-sm text-muted-foreground">
          Órdenes de producción diaria. Confirmar una orden congela costos y genera los insumos a entregar.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
        onRowClick={(o) => navigate(`/admin/produccion/${o.id}`)}
        emptyMessage="No hay órdenes de producción para estos filtros"
        toolbar={
          <>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Todos los estados</option>
              {PRODUCTION_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s as ProductionStatus]}
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
            <Button onClick={() => navigate('/admin/produccion/nueva')}>
              <Plus className="size-4" /> Nueva orden
            </Button>
          </>
        }
      />
    </div>
  );
}
