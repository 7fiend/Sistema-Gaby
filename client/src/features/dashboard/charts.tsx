import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardDay } from '@gaby/shared';
import { cn, formatCOP } from '@/lib/utils';

/**
 * Gráficos del dashboard (skill dataviz):
 * - líneas 2px sin puntos, grid hairline sólido solo horizontal, ejes recesivos;
 * - series con los tokens --chart-* (paleta validada en globals.css);
 * - utilidad como barras divergentes: el signo lo da la POSICIÓN sobre/bajo
 *   el eje cero; el color (verde/rojo) solo lo refuerza;
 * - tooltip siempre presente; leyenda propia porque hay ≥2 series.
 */

const SERIES = [
  { key: 'sales', label: 'Ventas', color: 'var(--chart-1)' },
  { key: 'productionCost', label: 'Costo producción', color: 'var(--chart-2)' },
  { key: 'expenses', label: 'Gastos', color: 'var(--chart-3)' },
] as const;

/** '2026-07-07' → '07/07' (fechas puras — nunca pasar por Date local). */
function shortDay(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const compactCOP = new Intl.NumberFormat('es-CO', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const names = new Map<string, string>(SERIES.map((s) => [s.key, s.label]));
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label ? shortDay(label) : ''}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: entry.color }} />
          {names.get(String(entry.dataKey)) ?? 'Utilidad'}
          <span className="tnum ml-auto pl-3 font-medium text-popover-foreground">
            {formatCOP(Number(entry.value ?? 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;

function Legend({ items }: { items: readonly { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function MoneyFlowChart({ days }: { days: DashboardDay[] }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Legend items={SERIES} />
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => `$${compactCOP.format(v)}`}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--border)' }} />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProfitChart({ days }: { days: DashboardDay[] }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Legend
        items={[
          { label: 'Utilidad positiva', color: 'var(--chart-1)' },
          { label: 'Pérdida', color: 'var(--chart-negative)' },
        ]}
      />
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => `$${compactCOP.format(v)}`}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--secondary)', opacity: 0.6 }} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="profit" maxBarSize={24} isAnimationActive={false}>
            {days.map((d) => (
              <Cell
                key={d.date}
                fill={d.profit < 0 ? 'var(--chart-negative)' : 'var(--chart-1)'}
                // Extremo de dato redondeado 4px; base cuadrada sobre el eje
                radius={(d.profit < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0]) as unknown as number}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barra horizontal secuencial (un solo matiz) para los "top" — sin ejes. */
export function RankBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn('h-full rounded-full bg-[var(--chart-1)]', className)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
