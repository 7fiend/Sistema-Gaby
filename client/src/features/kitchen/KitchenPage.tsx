import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import type { KitchenRecipeCard } from '@gaby/shared';
import { useRealtime } from '@/stores/realtime';
import { kitchenApi } from './api';
import { formatQty, cn } from '@/lib/utils';

const DEFAULT_ROTATION_SECONDS = 10;

/**
 * Monitor de Cocina (RF-11, kiosco de solo lectura): grid de recetas del día
 * con % de insumos entregados en vivo; tocar una tarjeta (o la auto-rotación)
 * muestra la receta a pantalla completa con ingredientes ya escalados.
 */
export function KitchenPage() {
  const realtimeStatus = useRealtime((s) => s.status);
  const [manualId, setManualId] = useState<string | null>(null);
  const [rotationEnabled, setRotationEnabled] = useState(true);
  const [rotationSeconds, setRotationSeconds] = useState(DEFAULT_ROTATION_SECONDS);
  const [rotationIndex, setRotationIndex] = useState(0);

  // F11: pantalla completa (mockup §4, atajo compartido con Bodega).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { data } = useQuery({
    queryKey: ['kitchen'],
    queryFn: () => kitchenApi.summary(),
    refetchInterval: 60_000,
  });
  const recipes = data?.recipes ?? [];

  const rotationRef = useRef({ enabled: rotationEnabled, manualId, seconds: rotationSeconds, count: recipes.length });
  rotationRef.current = { enabled: rotationEnabled, manualId, seconds: rotationSeconds, count: recipes.length };

  useEffect(() => {
    const timer = setInterval(() => {
      const { enabled, manualId: current, count } = rotationRef.current;
      if (enabled && !current && count > 0) {
        setRotationIndex((i) => (i + 1) % count);
      }
    }, rotationSeconds * 1000);
    return () => clearInterval(timer);
  }, [rotationSeconds]);

  const displayed = manualId
    ? (recipes.find((r) => r.recipeId === manualId) ?? null)
    : rotationEnabled && recipes.length > 0
      ? (recipes[rotationIndex % recipes.length] ?? null)
      : null;

  const exitDetail = () => {
    setManualId(null);
    setRotationEnabled(false);
  };

  useEffect(() => {
    if (!displayed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitDetail();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [displayed]);

  return (
    // Cocina arranca en oscuro (Fase 4 §3.3): la clase se aplica SOLO a este
    // subárbol (no al store global persistido) para no dejar el tema pegado
    // en el resto de la app al salir de /cocina.
    <div className="dark flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 px-8 pt-6 pb-4">
        <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Producción de hoy
        </h1>
        <span
          className={cn(
            'ml-auto flex items-center gap-2 text-sm font-medium',
            realtimeStatus === 'connected' ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-2 rounded-full',
              realtimeStatus === 'connected' ? 'bg-primary' : 'bg-muted-foreground',
            )}
          />
          {realtimeStatus === 'connected'
            ? 'en vivo'
            : realtimeStatus === 'connecting'
              ? 'conectando…'
              : 'sin conexión'}
        </span>
        <button
          type="button"
          onClick={() => setRotationEnabled((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        >
          {rotationEnabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          Auto-rotación
        </button>
        <input
          type="number"
          min={5}
          max={120}
          value={rotationSeconds}
          onChange={(e) => setRotationSeconds(Math.max(5, Number(e.target.value)))}
          className="w-16 rounded-md border bg-transparent px-2 py-1.5 text-xs tnum"
          aria-label="Segundos de auto-rotación"
        />
      </header>

      {displayed ? (
        <RecipeDetail recipe={displayed} onBack={exitDetail} />
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-4 px-8 pb-8 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.length === 0 && (
            <p className="col-span-full py-20 text-center text-lg text-muted-foreground">
              No hay órdenes en producción hoy.
            </p>
          )}
          {recipes.map((r) => (
            <button
              key={r.recipeId}
              type="button"
              onClick={() => setManualId(r.recipeId)}
              className="flex flex-col gap-3 rounded-xl border bg-card p-6 text-left transition-colors hover:border-primary"
            >
              <span className="tnum text-5xl font-bold">{r.totalPortions}</span>
              <span className="text-lg font-semibold uppercase leading-tight">{r.recipeName}</span>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full transition-all',
                    r.deliveredPct >= 100 ? 'bg-primary' : 'bg-warning',
                  )}
                  style={{ width: `${Math.min(100, r.deliveredPct)}%` }}
                />
              </div>
              <span className="tnum text-sm text-muted-foreground">
                {r.deliveredPct >= 100 ? 'Insumos completos ✔' : `${r.deliveredPct}% insumos entregados`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeDetail({ recipe, onBack }: { recipe: KitchenRecipeCard; onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-10 pb-10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
        >
          ← Volver (Esc)
        </button>
        <h2 className="text-3xl font-bold">{recipe.recipeName}</h2>
        <span className="tnum ml-auto text-lg text-muted-foreground">
          {recipe.totalPortions} porciones hoy
        </span>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ingredientes (escalados a hoy)
        </h3>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-1 text-xl sm:grid-cols-2">
          {recipe.ingredients.map((ing) => (
            <li key={ing.productName} className="tnum flex justify-between border-b py-1.5">
              <span>{ing.productName}</span>
              <span className="font-semibold">
                {formatQty(ing.quantity)} {ing.unitAbbreviation}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {recipe.steps.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pasos
          </h3>
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step, idx) => (
              <li key={idx} className="flex gap-4 text-xl leading-snug">
                <span className="tnum flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {idx + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes && (
        <section className="rounded-lg border bg-card p-4 text-lg text-muted-foreground">
          {recipe.notes}
        </section>
      )}
    </div>
  );
}

