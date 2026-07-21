import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, TriangleAlert } from 'lucide-react';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCOP } from '@/lib/utils';
import { inventoryApi, catalogApi, type Product } from './api';
import { ProductFormDialog } from './ProductFormDialog';

export function ProductsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products', { page, search, categoryId, lowStock }],
    queryFn: () =>
      inventoryApi.list({ page, search: search || undefined, categoryId: categoryId || undefined, lowStock: lowStock || undefined }),
  });
  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'PRODUCT'],
    queryFn: () => catalogApi.categories('PRODUCT'),
  });

  const columns: Column<Product>[] = [
    { header: 'Código', cell: (p) => <span className="tnum font-medium">{p.code}</span> },
    { header: 'Nombre', cell: (p) => p.name },
    { header: 'Categoría', cell: (p) => <span className="text-muted-foreground">{p.category.name}</span> },
    {
      header: 'Stock',
      className: 'text-right',
      cell: (p) => (
        <span className="tnum inline-flex items-center gap-1.5">
          {p.currentStock <= p.minStock && (
            <Badge variant="outline" className="gap-1 border-warning text-warning">
              <TriangleAlert className="size-3" /> bajo
            </Badge>
          )}
          {p.currentStock} {p.unit.abbreviation}
        </span>
      ),
    },
    {
      header: 'Mínimo',
      className: 'text-right',
      cell: (p) => (
        <span className="tnum text-muted-foreground">
          {p.minStock} {p.unit.abbreviation}
        </span>
      ),
    },
    {
      header: 'Costo prom.',
      className: 'text-right',
      cell: (p) => <span className="tnum">{formatCOP(p.avgCost)}</span>,
    },
    { header: 'Ubicación', cell: (p) => <span className="text-muted-foreground">{p.location ?? '—'}</span> },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Productos, existencias y costos promedio. Toca un producto para ver su kardex.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre o código…"
        onRowClick={(p) => navigate(`/admin/inventario/${p.id}`)}
        emptyMessage="No hay productos que coincidan"
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
            <Button
              variant={lowStock ? 'default' : 'outline'}
              onClick={() => {
                setLowStock(!lowStock);
                setPage(1);
              }}
            >
              <TriangleAlert className="size-4" /> Stock bajo
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" /> Nuevo producto
            </Button>
          </>
        }
      />

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
