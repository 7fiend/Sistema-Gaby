import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, SprayCan } from 'lucide-react';
import { ApiRequestError } from '@/lib/api';
import { inventoryApi } from '@/features/inventory/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Fase 18: aseo es una rutina diaria manual — cantidad variable, no pasa por báscula. */
export function RoutineConsumptionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', 'routine'],
    queryFn: () => inventoryApi.list({ page: 1, pageSize: 100, usageType: 'ROUTINE' }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.registerRoutineConsumption({
        entries: Object.entries(quantities)
          .map(([productId, q]) => ({ productId, quantity: Number(q) || 0 }))
          .filter((e) => e.quantity > 0),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Consumo de hoy registrado');
      setQuantities({});
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al registrar el consumo'),
  });

  const hasAnyQuantity = Object.values(quantities).some((v) => Number(v) > 0);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/bodega')} aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Button>
        <SprayCan className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">Rutina de aseo diaria</h1>
      </header>

      <div className="flex-1 p-6">
        <p className="mb-4 max-w-xl text-sm text-muted-foreground">
          Registra cuánto se usó hoy de cada producto de aseo. Deja en 0 o vacío lo que no se usó.
          Puedes volver a registrar más tarde en el día si hay más consumo.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : !products || products.items.length === 0 ? (
          <p className="rounded-lg border border-dashed px-6 py-8 text-sm text-muted-foreground">
            No hay productos marcados como "Aseo (registro manual diario)" en Inventario todavía.
          </p>
        ) : (
          <div className="flex max-w-xl flex-col gap-2">
            {products.items.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  Stock: {p.currentStock} {p.unit.abbreviation}
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  placeholder="0"
                  value={quantities[p.id] ?? ''}
                  onChange={(e) => setQuantities((q) => ({ ...q, [p.id]: e.target.value }))}
                  className="w-28"
                />
                <span className="w-10 text-xs text-muted-foreground">{p.unit.abbreviation}</span>
              </div>
            ))}

            <Button
              className="mt-2 self-end"
              disabled={!hasAnyQuantity || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Registrar consumo de hoy
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
