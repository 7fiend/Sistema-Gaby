import { mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  AuthUser,
  ReportExportInput,
  ReportResult,
  ReportsQuery,
  ReportType,
} from '@gaby/shared';
import { round2 } from '../../../domain/services/costing.js';
import type { IReportsRepository } from '../../../domain/repositories/IReportsRepository.js';
import type { IDashboardRepository } from '../../../domain/repositories/IDashboardRepository.js';
import type { IReportRepository, ReportRow } from '../../../domain/repositories/IReportRepository.js';
import { NotFoundError } from '../../../domain/errors/AppError.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import { writeReportFile } from '../../../infrastructure/reports/generateReportFile.js';
import { env } from '../../../config/env.js';

const TOP_LIMIT = 200;

const EXTENSION: Record<ReportExportInput['format'], string> = {
  PDF: 'pdf',
  XLSX: 'xlsx',
  CSV: 'csv',
};

const TITLES: Record<ReportType, string> = {
  sales: 'Ventas por receta',
  production: 'Producción del período',
  expenses: 'Gastos por categoría',
  profit: 'Utilidad diaria',
  inventory_value: 'Inventario valorizado',
  waste: 'Desperdicios y mermas',
  recipe_profitability: 'Rentabilidad por receta',
  top_recipes: 'Top recetas',
  top_ingredients: 'Top ingredientes',
};

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Casos de uso de Reportes (RF-12): agregaciones de solo lectura + export inmutable. */
export class ReportUseCases {
  constructor(
    private readonly reportsData: IReportsRepository,
    private readonly dashboard: IDashboardRepository,
    private readonly reports: IReportRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async generate(type: ReportType, from: Date, to: Date): Promise<ReportResult> {
    const base = { type, from: fmtDate(from), to: fmtDate(to), generatedAt: new Date().toISOString(), title: TITLES[type] };

    switch (type) {
      case 'sales': {
        const recipes = await this.dashboard.topRecipes(from, to, TOP_LIMIT);
        return {
          ...base,
          columns: [
            { key: 'name', header: 'Receta' },
            { key: 'portions', header: 'Porciones', align: 'right' },
            { key: 'total', header: 'Total vendido', align: 'right' },
          ],
          rows: recipes.map((r) => ({ name: r.name, portions: r.portions, total: r.total })),
          summary: {
            name: 'Total',
            portions: recipes.reduce((s, r) => s + r.portions, 0),
            total: round2(recipes.reduce((s, r) => s + r.total, 0)),
          },
        };
      }
      case 'production': {
        const rows = await this.reportsData.productionSummary(from, to);
        return {
          ...base,
          columns: [
            { key: 'orderNumber', header: 'Orden' },
            { key: 'date', header: 'Fecha' },
            { key: 'recipeName', header: 'Receta' },
            { key: 'portions', header: 'Porciones', align: 'right' },
            { key: 'totalCostSnapshot', header: 'Costo', align: 'right' },
          ],
          rows: rows.map((r) => ({
            orderNumber: r.orderNumber,
            date: fmtDate(r.date),
            recipeName: r.recipeName,
            portions: r.portions,
            totalCostSnapshot: r.totalCostSnapshot,
          })),
          summary: {
            orderNumber: '',
            date: '',
            recipeName: 'Total',
            portions: rows.reduce((s, r) => s + r.portions, 0),
            totalCostSnapshot: round2(rows.reduce((s, r) => s + r.totalCostSnapshot, 0)),
          },
        };
      }
      case 'expenses': {
        const rows = await this.reportsData.expensesByCategory(from, to);
        return {
          ...base,
          columns: [
            { key: 'categoryName', header: 'Categoría' },
            { key: 'count', header: 'Cantidad', align: 'right' },
            { key: 'totalAmount', header: 'Total', align: 'right' },
          ],
          rows: rows.map((r) => ({ categoryName: r.categoryName, count: r.count, totalAmount: r.totalAmount })),
          summary: {
            categoryName: 'Total',
            count: rows.reduce((s, r) => s + r.count, 0),
            totalAmount: round2(rows.reduce((s, r) => s + r.totalAmount, 0)),
          },
        };
      }
      case 'profit': {
        const days = await this.dashboard.dailyTotals(from, to);
        return {
          ...base,
          columns: [
            { key: 'date', header: 'Fecha' },
            { key: 'sales', header: 'Ventas', align: 'right' },
            { key: 'productionCost', header: 'Costo producción', align: 'right' },
            { key: 'expenses', header: 'Gastos', align: 'right' },
            { key: 'profit', header: 'Utilidad', align: 'right' },
          ],
          rows: days.map((d) => ({ ...d })),
          summary: {
            date: 'Total',
            sales: round2(days.reduce((s, d) => s + d.sales, 0)),
            productionCost: round2(days.reduce((s, d) => s + d.productionCost, 0)),
            expenses: round2(days.reduce((s, d) => s + d.expenses, 0)),
            profit: round2(days.reduce((s, d) => s + d.profit, 0)),
          },
        };
      }
      case 'inventory_value': {
        const rows = await this.reportsData.inventoryValue();
        return {
          ...base,
          notes: `Inventario actual al ${base.generatedAt} — el rango de fechas no aplica a este reporte (no hay fotos históricas de stock).`,
          columns: [
            { key: 'code', header: 'Código' },
            { key: 'name', header: 'Producto' },
            { key: 'categoryName', header: 'Categoría' },
            { key: 'currentStock', header: 'Stock', align: 'right' },
            { key: 'avgCost', header: 'Costo promedio', align: 'right' },
            { key: 'totalValue', header: 'Valor total', align: 'right' },
          ],
          rows: rows.map((r) => ({ ...r })),
          summary: {
            code: '',
            name: '',
            categoryName: 'Total',
            currentStock: '',
            avgCost: '',
            totalValue: round2(rows.reduce((s, r) => s + r.totalValue, 0)),
          },
        };
      }
      case 'waste': {
        const rows = await this.reportsData.wasteReport(from, to);
        return {
          ...base,
          columns: [
            { key: 'source', header: 'Origen' },
            { key: 'productName', header: 'Producto' },
            { key: 'unitAbbreviation', header: 'Unidad' },
            { key: 'requiredQuantity', header: 'Requerido', align: 'right' },
            { key: 'deliveredQuantity', header: 'Entregado', align: 'right' },
            { key: 'movementQuantity', header: 'Cant. merma/pérdida', align: 'right' },
            { key: 'movementValue', header: 'Valor merma/pérdida', align: 'right' },
          ],
          rows: rows.map((r) => ({
            source: r.source === 'production' ? 'Producción' : 'Inventario',
            productName: r.productName,
            unitAbbreviation: r.unitAbbreviation,
            requiredQuantity: r.requiredQuantity ?? '',
            deliveredQuantity: r.deliveredQuantity ?? '',
            movementQuantity: r.movementQuantity ?? '',
            movementValue: r.movementValue ?? '',
          })),
          summary: {
            source: '',
            productName: 'Total valorizado (inventario)',
            unitAbbreviation: '',
            requiredQuantity: '',
            deliveredQuantity: '',
            movementQuantity: '',
            movementValue: round2(rows.reduce((s, r) => s + (r.movementValue ?? 0), 0)),
          },
        };
      }
      case 'recipe_profitability': {
        const rows = await this.reportsData.recipeProfitability(from, to);
        const withMargin = rows.map((r) => {
          const profit = round2(r.salesTotal - r.productionCost);
          const marginPct = r.salesTotal > 0 ? Math.round((profit / r.salesTotal) * 100) : 0;
          return { recipeName: r.recipeName, salesTotal: r.salesTotal, productionCost: r.productionCost, profit, marginPct };
        });
        return {
          ...base,
          columns: [
            { key: 'recipeName', header: 'Receta' },
            { key: 'salesTotal', header: 'Ventas', align: 'right' },
            { key: 'productionCost', header: 'Costo producción', align: 'right' },
            { key: 'profit', header: 'Utilidad', align: 'right' },
            { key: 'marginPct', header: 'Margen %', align: 'right' },
          ],
          rows: withMargin,
          summary: {
            recipeName: 'Total',
            salesTotal: round2(withMargin.reduce((s, r) => s + r.salesTotal, 0)),
            productionCost: round2(withMargin.reduce((s, r) => s + r.productionCost, 0)),
            profit: round2(withMargin.reduce((s, r) => s + r.profit, 0)),
            marginPct: '',
          },
        };
      }
      case 'top_recipes': {
        const recipes = await this.dashboard.topRecipes(from, to, TOP_LIMIT);
        return {
          ...base,
          columns: [
            { key: 'name', header: 'Receta' },
            { key: 'portions', header: 'Porciones vendidas', align: 'right' },
            { key: 'total', header: 'Total vendido', align: 'right' },
          ],
          rows: recipes.map((r) => ({ name: r.name, portions: r.portions, total: r.total })),
        };
      }
      case 'top_ingredients': {
        const ingredients = await this.dashboard.topIngredients(from, to, TOP_LIMIT);
        return {
          ...base,
          columns: [
            { key: 'name', header: 'Ingrediente' },
            { key: 'quantity', header: 'Cantidad requerida', align: 'right' },
            { key: 'unit', header: 'Unidad' },
            { key: 'estimatedCost', header: 'Costo estimado', align: 'right' },
          ],
          rows: ingredients.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            estimatedCost: i.estimatedCost,
          })),
        };
      }
    }
  }

  async export(
    type: ReportType,
    input: ReportExportInput,
    user: AuthUser,
  ): Promise<{ record: ReportRow; filePath: string }> {
    const result = await this.generate(type, input.from, input.to);

    const dir = path.resolve(env.UPLOADS_DIR, 'reports');
    await mkdir(dir, { recursive: true });
    const id = `${type}-${Date.now()}`;
    const filePath = path.join(dir, `${id}.${EXTENSION[input.format]}`);
    await writeReportFile(result, input.format, filePath);

    try {
      const record = await this.reports.create({
        type,
        params: { from: input.from, to: input.to },
        format: input.format,
        filePath,
        createdById: user.id,
      });
      await this.audit.log({
        kind: 'SYSTEM',
        userId: user.id,
        action: 'report.export',
        resource: 'reports',
        resourceId: record.id,
        after: { type, format: input.format, from: fmtDate(input.from), to: fmtDate(input.to) },
      });
      return { record, filePath };
    } catch (e) {
      await unlink(filePath).catch(() => undefined);
      throw e;
    }
  }

  list(query: ReportsQuery) {
    return this.reports.list(query);
  }

  async download(id: string): Promise<ReportRow> {
    const record = await this.reports.findById(id);
    if (!record || !existsSync(record.filePath)) {
      throw new NotFoundError('Reporte', id);
    }
    return record;
  }
}
