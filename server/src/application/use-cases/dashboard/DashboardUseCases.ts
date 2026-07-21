import {
  DASHBOARD_RANGE_DAYS,
  type AuthUser,
  type DashboardDay,
  type DashboardSummary,
} from '@gaby/shared';
import type { IDashboardRepository } from '../../../domain/repositories/IDashboardRepository.js';
import type { AlertData, IAlertRepository } from '../../../domain/repositories/IAlertRepository.js';
import { toDateOnlyUTC } from '../../../domain/services/production.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';

const TOP_LIMIT = 5;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Casos de uso del dashboard: KPIs, series de 14 días, tops y centro de alertas. */
export class DashboardUseCases {
  constructor(
    private readonly dashboard: IDashboardRepository,
    private readonly alerts: IAlertRepository,
    private readonly audit: IAuditLogger,
  ) {}

  /** `date` = fecha local del cliente (ver dashboardQuerySchema). */
  async summary(date: Date): Promise<DashboardSummary> {
    const today = toDateOnlyUTC(date);
    const from = addDays(today, -(DASHBOARD_RANGE_DAYS - 1));

    const [totals, portionsToday, topRecipes, topIngredients] = await Promise.all([
      this.dashboard.dailyTotals(from, today),
      this.dashboard.portionsOn(today),
      this.dashboard.topRecipes(from, today, TOP_LIMIT),
      this.dashboard.topIngredients(from, today, TOP_LIMIT),
    ]);

    // Serie completa: los días sin datos aparecen en cero (los gráficos no saltan fechas)
    const byKey = new Map(totals.map((t) => [t.date, t]));
    const days: DashboardDay[] = Array.from({ length: DASHBOARD_RANGE_DAYS }, (_, i) => {
      const key = addDays(from, i).toISOString().slice(0, 10);
      return byKey.get(key) ?? { date: key, sales: 0, productionCost: 0, expenses: 0, profit: 0 };
    });

    // El rango siempre tiene DASHBOARD_RANGE_DAYS (≥2) entradas
    const todayRow = days[days.length - 1]!;
    const yesterdayRow = days[days.length - 2]!;

    return {
      kpis: {
        salesToday: todayRow.sales,
        salesYesterday: yesterdayRow.sales,
        productionCostToday: todayRow.productionCost,
        productionCostYesterday: yesterdayRow.productionCost,
        expensesToday: todayRow.expenses,
        expensesYesterday: yesterdayRow.expenses,
        profitToday: todayRow.profit,
        profitYesterday: yesterdayRow.profit,
        portionsToday,
      },
      days,
      topRecipes,
      topIngredients,
    };
  }

  listAlerts(limit: number): Promise<AlertData[]> {
    return this.alerts.listUnread(limit);
  }

  async markAlertRead(id: string, user: AuthUser): Promise<void> {
    await this.alerts.markRead(id);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'alert.read',
      resource: 'alerts',
      resourceId: id,
    });
  }
}
