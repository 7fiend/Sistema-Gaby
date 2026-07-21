import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  Check,
  Minus,
  ShieldAlert,
  TrendingDown,
} from 'lucide-react';
import type { DashboardSummary } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { cn, formatCOP, formatQty, todayISO } from '@/lib/utils';
import { dashboardApi, type Alert } from './api';
import { MoneyFlowChart, ProfitChart, RankBar } from './charts';

/** Delta vs ayer: color = dirección × si subir es bueno (skill dataviz). */
function Delta({
  today,
  yesterday,
  upIsGood,
}: {
  today: number;
  yesterday: number;
  upIsGood: boolean;
}) {
  const diff = today - yesterday;
  if (diff === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> igual que ayer
      </span>
    );
  }
  const up = diff > 0;
  const good = up === upIsGood;
  const text =
    yesterday !== 0
      ? `${Math.abs((diff / Math.abs(yesterday)) * 100).toFixed(0)} %`
      : formatCOP(Math.abs(diff));
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        good ? 'text-primary' : 'text-destructive',
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      <span className="tnum">{text}</span> vs ayer
    </span>
  );
}

function KpiTile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum mt-1 text-2xl font-semibold">{value}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {delta}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

const ALERT_KINDS: Record<string, { label: string; icon: typeof Bell }> = {
  stock_low: { label: 'Stock bajo', icon: TrendingDown },
  stock_expiring: { label: 'Por vencer', icon: CalendarClock },
  delivery_blocked: { label: 'Entrega bloqueada', icon: ShieldAlert },
};

const alertTime = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Bogota',
});

function AlertRow({ alert }: { alert: Alert }) {
  const queryClient = useQueryClient();
  const kind = ALERT_KINDS[alert.type] ?? { label: 'Alerta', icon: Bell };
  const Icon = kind.icon;
  const markRead = useMutation({
    mutationFn: () => dashboardApi.markAlertRead(alert.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts'] }),
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'No se pudo marcar la alerta'),
  });
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{alert.message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {kind.label} · <span className="tnum">{alertTime.format(new Date(alert.createdAt))}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => markRead.mutate()}
        disabled={markRead.isPending}
        aria-label="Marcar como leída"
        title="Marcar como leída"
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Check className="size-4" />
      </button>
    </li>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border bg-card p-4', className)}>
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg border bg-card', className)} />;
}

export function DashboardPage() {
  const today = todayISO();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'summary', today],
    queryFn: () => dashboardApi.summary(today),
  });
  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => dashboardApi.alerts(20),
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen del día y de los últimos 14 días. Se actualiza en vivo con la operación.
        </p>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : (
        <DashboardContent data={data} alerts={alerts} />
      )}
    </div>
  );
}

function DashboardContent({ data, alerts }: { data: DashboardSummary; alerts?: Alert[] }) {
  const { kpis } = data;
  const maxRecipe = Math.max(...data.topRecipes.map((r) => r.total), 0);
  const maxIngredient = Math.max(...data.topIngredients.map((i) => i.estimatedCost), 0);

  return (
    <div className="grid gap-4">
      {/* Fila de KPIs (stat tiles con delta vs ayer) */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile
          label="Ventas de hoy"
          value={formatCOP(kpis.salesToday)}
          sub={`${kpis.portionsToday} porciones`}
          delta={<Delta today={kpis.salesToday} yesterday={kpis.salesYesterday} upIsGood />}
        />
        <KpiTile
          label="Utilidad de hoy"
          value={formatCOP(kpis.profitToday)}
          sub="ventas − costo − gastos"
          delta={<Delta today={kpis.profitToday} yesterday={kpis.profitYesterday} upIsGood />}
        />
        <KpiTile
          label="Costo de producción"
          value={formatCOP(kpis.productionCostToday)}
          sub="snapshot congelado"
          delta={
            <Delta
              today={kpis.productionCostToday}
              yesterday={kpis.productionCostYesterday}
              upIsGood={false}
            />
          }
        />
        <KpiTile
          label="Gastos de hoy"
          value={formatCOP(kpis.expensesToday)}
          delta={
            <Delta today={kpis.expensesToday} yesterday={kpis.expensesYesterday} upIsGood={false} />
          }
        />
      </div>

      {/* Series de 14 días */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ventas y costos" subtitle="Últimos 14 días">
          <MoneyFlowChart days={data.days} />
        </Panel>
        <Panel title="Utilidad diaria" subtitle="Últimos 14 días · sobre el eje = ganancia">
          <ProfitChart days={data.days} />
        </Panel>
      </div>

      {/* Alertas + tops */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title={`Alertas${alerts?.length ? ` (${alerts.length})` : ''}`}
          subtitle="Sin leer — stock bajo, vencimientos, entregas bloqueadas"
        >
          {!alerts?.length ? (
            <EmptyHint text="Sin alertas pendientes ✨" />
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto">
              {alerts.map((a) => (
                <AlertRow key={a.id} alert={a} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top recetas" subtitle="Por porciones vendidas · 14 días">
          {data.topRecipes.length === 0 ? (
            <EmptyHint text="Aún no hay ventas en el periodo" />
          ) : (
            <ul className="grid gap-3">
              {data.topRecipes.map((r) => (
                <li key={r.recipeId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">{r.name}</span>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">
                      {r.portions} porc. · {formatCOP(r.total)}
                    </span>
                  </div>
                  <RankBar value={r.total} max={maxRecipe} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top ingredientes" subtitle="Por costo estimado en producción · 14 días">
          {data.topIngredients.length === 0 ? (
            <EmptyHint text="Aún no hay producción en el periodo" />
          ) : (
            <ul className="grid gap-3">
              {data.topIngredients.map((i) => (
                <li key={i.productId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">{i.name}</span>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">
                      {formatQty(i.quantity)} {i.unit} · {formatCOP(i.estimatedCost)}
                    </span>
                  </div>
                  <RankBar value={i.estimatedCost} max={maxIngredient} className="bg-[var(--chart-2)]" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
