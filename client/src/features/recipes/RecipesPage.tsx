import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { formatCOP } from '@/lib/utils';
import { catalogApi } from '@/features/inventory/api';
import { recipesApi, type Recipe } from './api';

export function RecipesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['recipes', { page, search, categoryId }],
    queryFn: () =>
      recipesApi.list({ page, search: search || undefined, categoryId: categoryId || undefined }),
  });
  const { data: categories } = useQuery({
    queryKey: ['catalog', 'categories', 'RECIPE'],
    queryFn: () => catalogApi.categories('RECIPE'),
  });

  const columns: Column<Recipe>[] = [
    { header: 'Receta', cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: 'Categoría', cell: (r) => <span className="text-muted-foreground">{r.category.name}</span> },
    { header: 'Rinde', className: 'text-right', cell: (r) => <span className="tnum">{r.yieldPortions} porciones</span> },
    { header: 'Costo/porción', className: 'text-right', cell: (r) => <span className="tnum">{formatCOP(r.costPerPortion)}</span> },
    { header: 'Precio sugerido', className: 'text-right', cell: (r) => <span className="tnum font-medium text-primary">{formatCOP(r.suggestedPrice)}</span> },
    { header: 'Margen obj.', className: 'text-right', cell: (r) => <span className="tnum text-muted-foreground">{r.targetMarginPct}%</span> },
    { header: 'Versión', className: 'text-right', cell: (r) => <span className="tnum text-muted-foreground">v{r.currentVersionNumber}</span> },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Recetas</h1>
        <p className="text-sm text-muted-foreground">
          Costos calculados con el promedio vigente de cada ingrediente; editar ingredientes crea una nueva versión.
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
        searchPlaceholder="Buscar receta…"
        onRowClick={(r) => navigate(`/admin/recetas/${r.id}`)}
        emptyMessage="No hay recetas"
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
            <Button onClick={() => navigate('/admin/recetas/nueva')}>
              <Plus className="size-4" /> Nueva receta
            </Button>
          </>
        }
      />
    </div>
  );
}
