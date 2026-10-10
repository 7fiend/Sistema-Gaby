/**
 * Composición de dependencias (AD-03): inyección manual tipada.
 * Sin frameworks de DI — a esta escala, la composición explícita es más
 * legible, más rápida y 100 % verificable por el compilador.
 *
 * Regla: los constructores reciben INTERFACES (puertos del dominio);
 * aquí es el único lugar donde se eligen las implementaciones concretas.
 */
import { prisma } from './infrastructure/database/prisma.js';
import { PrismaCatalogRepository } from './infrastructure/database/repositories/PrismaCatalogRepository.js';
import { PrismaUserRepository } from './infrastructure/database/repositories/PrismaUserRepository.js';
import { PrismaSessionRepository } from './infrastructure/database/repositories/PrismaSessionRepository.js';
import { PrismaSettingsRepository } from './infrastructure/database/repositories/PrismaSettingsRepository.js';
import { PrismaAuditLogger } from './infrastructure/audit/PrismaAuditLogger.js';
import { Argon2Hasher } from './infrastructure/auth/Argon2Hasher.js';
import { JwtTokenService } from './infrastructure/auth/JwtTokenService.js';
import { PrismaProductRepository } from './infrastructure/database/repositories/PrismaProductRepository.js';
import { PrismaRecipeRepository } from './infrastructure/database/repositories/PrismaRecipeRepository.js';
import { PrismaAlertRepository } from './infrastructure/database/repositories/PrismaAlertRepository.js';
import { PrismaProductionRepository } from './infrastructure/database/repositories/PrismaProductionRepository.js';
import { PrismaDeliveryRepository } from './infrastructure/database/repositories/PrismaDeliveryRepository.js';
import { PrismaSaleRepository } from './infrastructure/database/repositories/PrismaSaleRepository.js';
import { PrismaExpenseRepository } from './infrastructure/database/repositories/PrismaExpenseRepository.js';
import { PrismaReportsRepository } from './infrastructure/database/repositories/PrismaReportsRepository.js';
import { PrismaReportRepository } from './infrastructure/database/repositories/PrismaReportRepository.js';
import { PrismaAuditRepository } from './infrastructure/database/repositories/PrismaAuditRepository.js';
import { PrismaBackupRepository } from './infrastructure/database/repositories/PrismaBackupRepository.js';
import { PrismaWeeklyMenuRepository } from './infrastructure/database/repositories/PrismaWeeklyMenuRepository.js';
import { PrismaScheduleRepository } from './infrastructure/database/repositories/PrismaScheduleRepository.js';
import { ExcelScheduleExporter } from './infrastructure/schedules/ExcelScheduleExporter.js';
import { PgDumpBackupService } from './infrastructure/backups/PgDumpBackupService.js';
import { GetCatalogs } from './application/use-cases/catalog/GetCatalogs.js';
import { CategoryUseCases } from './application/use-cases/catalog/CategoryUseCases.js';
import { Login } from './application/use-cases/auth/Login.js';
import { RefreshSession } from './application/use-cases/auth/RefreshSession.js';
import { Logout } from './application/use-cases/auth/Logout.js';
import { InventoryUseCases } from './application/use-cases/inventory/InventoryUseCases.js';
import { RecipeUseCases } from './application/use-cases/recipes/RecipeUseCases.js';
import { ProductionUseCases } from './application/use-cases/production/ProductionUseCases.js';
import { DeliveryUseCases } from './application/use-cases/delivery/DeliveryUseCases.js';
import { SalesUseCases } from './application/use-cases/sales/SalesUseCases.js';
import { ExpenseUseCases } from './application/use-cases/expenses/ExpenseUseCases.js';
import { DashboardUseCases } from './application/use-cases/dashboard/DashboardUseCases.js';
import { UserUseCases } from './application/use-cases/users/UserUseCases.js';
import { SettingsUseCases } from './application/use-cases/settings/SettingsUseCases.js';
import { GenerateExpiryAlerts } from './application/use-cases/system/GenerateExpiryAlerts.js';
import { KitchenUseCases } from './application/use-cases/kitchen/KitchenUseCases.js';
import { ReportUseCases } from './application/use-cases/reports/ReportUseCases.js';
import { AuditUseCases } from './application/use-cases/audit/AuditUseCases.js';
import { BackupUseCases } from './application/use-cases/backups/BackupUseCases.js';
import { WeeklyMenuUseCases } from './application/use-cases/menu/WeeklyMenuUseCases.js';
import { ScheduleUseCases } from './application/use-cases/schedules/ScheduleUseCases.js';
import { PrismaDashboardRepository } from './infrastructure/database/repositories/PrismaDashboardRepository.js';
import { CatalogController } from './presentation/http/controllers/catalog.controller.js';
import { AuthController } from './presentation/http/controllers/auth.controller.js';
import { InventoryController } from './presentation/http/controllers/inventory.controller.js';
import { RecipesController } from './presentation/http/controllers/recipes.controller.js';
import { ProductionController } from './presentation/http/controllers/production.controller.js';
import { DeliveryController } from './presentation/http/controllers/delivery.controller.js';
import { SalesController } from './presentation/http/controllers/sales.controller.js';
import { ExpensesController } from './presentation/http/controllers/expenses.controller.js';
import { DashboardController } from './presentation/http/controllers/dashboard.controller.js';
import { UsersController } from './presentation/http/controllers/users.controller.js';
import { SettingsController } from './presentation/http/controllers/settings.controller.js';
import { KitchenController } from './presentation/http/controllers/kitchen.controller.js';
import { ReportsController } from './presentation/http/controllers/reports.controller.js';
import { AuditController } from './presentation/http/controllers/audit.controller.js';
import { BackupsController } from './presentation/http/controllers/backups.controller.js';
import { WeeklyMenuController } from './presentation/http/controllers/weeklyMenu.controller.js';
import { SchedulesController } from './presentation/http/controllers/schedules.controller.js';
import type { ITokenService } from './application/ports/ITokenService.js';
import type { IEventBus } from './application/ports/IEventBus.js';

export interface ContainerDeps {
  /** Creado en main.ts junto al httpServer (Socket.IO necesita el server). */
  eventBus: IEventBus;
  tokens: ITokenService;
}

export function buildContainer({ eventBus, tokens }: ContainerDeps) {
  // --- Servicios de infraestructura ---
  const audit = new PrismaAuditLogger(prisma);
  const hasher = new Argon2Hasher();

  // --- Repositorios (adaptadores Prisma) ---
  const catalogRepo = new PrismaCatalogRepository(prisma);
  const userRepo = new PrismaUserRepository(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);
  const settingsRepo = new PrismaSettingsRepository(prisma);
  const productRepo = new PrismaProductRepository(prisma);
  const recipeRepo = new PrismaRecipeRepository(prisma);
  const alertRepo = new PrismaAlertRepository(prisma);
  const productionRepo = new PrismaProductionRepository(prisma);
  const deliveryRepo = new PrismaDeliveryRepository(prisma);
  const saleRepo = new PrismaSaleRepository(prisma);
  const expenseRepo = new PrismaExpenseRepository(prisma);
  const dashboardRepo = new PrismaDashboardRepository(prisma);
  const reportsDataRepo = new PrismaReportsRepository(prisma);
  const reportRepo = new PrismaReportRepository(prisma);
  const auditRepo = new PrismaAuditRepository(prisma);
  const backupRepo = new PrismaBackupRepository(prisma);
  const backupService = new PgDumpBackupService();
  const weeklyMenuRepo = new PrismaWeeklyMenuRepository(prisma);
  const scheduleRepo = new PrismaScheduleRepository(prisma);
  const scheduleExporter = new ExcelScheduleExporter();

  // --- Casos de uso ---
  const getCatalogs = new GetCatalogs(catalogRepo);
  const categoryUseCases = new CategoryUseCases(catalogRepo, audit);
  const login = new Login(userRepo, sessionRepo, settingsRepo, hasher, tokens, audit);
  const refreshSession = new RefreshSession(userRepo, sessionRepo, tokens, audit);
  const logout = new Logout(sessionRepo, audit);
  const inventory = new InventoryUseCases(productRepo, recipeRepo, alertRepo, audit, eventBus);
  const recipes = new RecipeUseCases(recipeRepo, audit, eventBus);
  const production = new ProductionUseCases(productionRepo, settingsRepo, audit, eventBus);
  const delivery = new DeliveryUseCases(deliveryRepo, production, alertRepo, audit, eventBus);
  const sales = new SalesUseCases(saleRepo, audit, eventBus);
  const expenses = new ExpenseUseCases(expenseRepo, audit, eventBus);
  const dashboard = new DashboardUseCases(dashboardRepo, alertRepo, audit);
  const users = new UserUseCases(userRepo, sessionRepo, hasher, audit);
  const settings = new SettingsUseCases(settingsRepo, audit);
  const expiryAlerts = new GenerateExpiryAlerts(productRepo, alertRepo, settingsRepo, audit, eventBus);
  const kitchen = new KitchenUseCases(productionRepo);
  const reports = new ReportUseCases(reportsDataRepo, dashboardRepo, reportRepo, audit);
  const auditLogs = new AuditUseCases(auditRepo);
  const backups = new BackupUseCases(backupRepo, backupService, settings, audit);
  const weeklyMenu = new WeeklyMenuUseCases(weeklyMenuRepo, audit);
  const schedules = new ScheduleUseCases(scheduleRepo, scheduleExporter, settingsRepo, audit);

  // --- Controllers ---
  const catalogController = new CatalogController(getCatalogs, categoryUseCases);
  const authController = new AuthController(login, refreshSession, logout);
  const inventoryController = new InventoryController(inventory);
  const recipesController = new RecipesController(recipes);
  const productionController = new ProductionController(production);
  const deliveryController = new DeliveryController(delivery);
  const salesController = new SalesController(sales);
  const expensesController = new ExpensesController(expenses);
  const dashboardController = new DashboardController(dashboard);
  const usersController = new UsersController(users);
  const settingsController = new SettingsController(settings);
  const kitchenController = new KitchenController(kitchen);
  const reportsController = new ReportsController(reports);
  const auditController = new AuditController(auditLogs);
  const backupsController = new BackupsController(backups);
  const weeklyMenuController = new WeeklyMenuController(weeklyMenu);
  const schedulesController = new SchedulesController(schedules);

  return {
    catalogController,
    authController,
    inventoryController,
    recipesController,
    productionController,
    deliveryController,
    salesController,
    expensesController,
    dashboardController,
    usersController,
    settingsController,
    kitchenController,
    reportsController,
    auditController,
    backupsController,
    weeklyMenuController,
    schedulesController,
    backups,
    settings,
    expiryAlerts,
    tokens,
    audit,
    eventBus,
  };
}

export type Container = ReturnType<typeof buildContainer>;
