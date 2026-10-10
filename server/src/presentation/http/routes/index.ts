import { Router } from 'express';
import {
  adjustmentSchema,
  alertsQuerySchema,
  auditQuerySchema,
  backupRestoreSchema,
  backupsQuerySchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  employeeSchema,
  dashboardQuerySchema,
  deliveryRegisterSchema,
  entrySchema,
  expenseSchema,
  expensesQuerySchema,
  kitchenSummaryQuerySchema,
  loginSchema,
  menuForDateQuerySchema,
  reportExportSchema,
  reportRangeQuerySchema,
  reportsQuerySchema,
  movementsQuerySchema,
  productSchema,
  productionCreateSchema,
  productionQuerySchema,
  productsQuerySchema,
  recipeCreateSchema,
  recipeReviseSchema,
  recipeUpdateSchema,
  recipesQuerySchema,
  routineConsumptionSchema,
  scheduleGenerateSchema,
  scheduleMonthQuerySchema,
  shiftAssignmentUpdateSchema,
  saleRecordSchema,
  salesQuerySchema,
  settingsUpdateSchema,
  userCreateSchema,
  userResetPasswordSchema,
  userUpdateSchema,
  usersQuerySchema,
  weeklyMenuSlotSetSchema,
  SOCKET_ROOMS,
} from '@gaby/shared';
import type { Container } from '../../../container.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { categoriesQuerySchema } from '../controllers/catalog.controller.js';
import { saleDayQuerySchema } from '../controllers/sales.controller.js';
import { employeesQuerySchema } from '../controllers/schedules.controller.js';
import { isDev } from '../../../config/env.js';

/** Router raíz /api/v1 — un sub-router por módulo. */
export function buildRoutes(c: Container): Router {
  const router = Router();
  const auth = requireAuth(c.tokens);

  // Salud del servicio (sin auth: lo usan scripts y monitoreo)
  router.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  // --- Autenticación ---
  router.post('/auth/login', validate({ body: loginSchema }), c.authController.login);
  router.post('/auth/refresh', c.authController.refresh);
  router.post('/auth/logout', c.authController.logout);
  router.get('/auth/me', auth, c.authController.me);

  // --- Catálogos base (lectura: cualquier usuario autenticado) ---
  router.get('/catalog/units', auth, c.catalogController.units);
  router.get(
    '/catalog/categories',
    auth,
    validate({ query: categoriesQuerySchema }),
    c.catalogController.categories,
  );
  router.get(
    '/catalog/suppliers',
    auth,
    requirePermission('products:read', c.audit),
    c.catalogController.suppliers,
  );

  // --- Productos e inventario ---
  const perm = (key: Parameters<typeof requirePermission>[0]) => requirePermission(key, c.audit);

  // --- Categorías (Fase 18: antes solo lectura, el cliente no podía crear dietas nuevas) ---
  router.post('/catalog/categories', auth, perm('categories:create'), validate({ body: categoryCreateSchema }), c.catalogController.createCategory);
  router.put('/catalog/categories/:id', auth, perm('categories:update'), validate({ body: categoryUpdateSchema }), c.catalogController.updateCategory);
  router.post('/catalog/categories/:id/deactivate', auth, perm('categories:deactivate'), c.catalogController.deactivateCategory);

  router.get('/products', auth, perm('products:read'), validate({ query: productsQuerySchema }), c.inventoryController.list);
  router.post('/products', auth, perm('products:create'), validate({ body: productSchema }), c.inventoryController.create);
  router.get('/products/:id', auth, perm('products:read'), c.inventoryController.get);
  router.put('/products/:id', auth, perm('products:update'), validate({ body: productSchema.partial() }), c.inventoryController.update);
  router.post('/products/:id/deactivate', auth, perm('products:deactivate'), c.inventoryController.deactivate);
  router.get('/products/:id/movements', auth, perm('inventory:read'), validate({ query: movementsQuerySchema }), c.inventoryController.movements);

  router.post('/inventory/entries', auth, perm('inventory:entry'), validate({ body: entrySchema }), c.inventoryController.entry);
  router.post('/inventory/adjustments', auth, perm('inventory:adjust'), validate({ body: adjustmentSchema }), c.inventoryController.adjustment);

  // --- Rutina de aseo diaria (Fase 18): NO usa inventory:adjust — bodega no gana adjust general ---
  router.post(
    '/inventory/routine-consumption',
    auth,
    perm('routine:register'),
    validate({ body: routineConsumptionSchema }),
    c.inventoryController.routineConsumption,
  );

  // --- Recetas ---
  router.get('/recipes', auth, perm('recipes:read'), validate({ query: recipesQuerySchema }), c.recipesController.list);
  router.post('/recipes', auth, perm('recipes:create'), validate({ body: recipeCreateSchema }), c.recipesController.create);
  router.get('/recipes/:id', auth, perm('recipes:read'), c.recipesController.get);
  router.put('/recipes/:id', auth, perm('recipes:update'), validate({ body: recipeUpdateSchema }), c.recipesController.update);
  router.post('/recipes/:id/revise', auth, perm('recipes:update'), validate({ body: recipeReviseSchema }), c.recipesController.revise);
  router.post('/recipes/:id/deactivate', auth, perm('recipes:deactivate'), c.recipesController.deactivate);

  // --- Menú semanal (Fase 18): día×tiempo de comida×categoría → receta, + recomendación por inventario ---
  router.get('/menu/slots', auth, perm('menu:read'), c.weeklyMenuController.listSlots);
  router.put('/menu/slots', auth, perm('menu:update'), validate({ body: weeklyMenuSlotSetSchema }), c.weeklyMenuController.setSlot);
  router.get('/menu/today', auth, perm('menu:read'), validate({ query: menuForDateQuerySchema }), c.weeklyMenuController.today);

  // --- Producción diaria ---
  router.get('/production', auth, perm('production:read'), validate({ query: productionQuerySchema }), c.productionController.list);
  router.post('/production', auth, perm('production:create'), validate({ body: productionCreateSchema }), c.productionController.create);
  router.get('/production/:id', auth, perm('production:read'), c.productionController.get);
  router.get('/production/:id/availability', auth, perm('production:read'), c.productionController.availability);
  router.post('/production/:id/confirm', auth, perm('production:confirm'), c.productionController.confirm);
  router.post('/production/:id/cancel', auth, perm('production:cancel'), c.productionController.cancel);
  router.post('/production/:id/close', auth, perm('production:close'), c.productionController.close);
  router.post('/production/:id/start', auth, perm('production:start'), c.productionController.start);
  router.post('/production/:id/complete', auth, perm('production:complete'), c.productionController.complete);

  // --- Bodega: entregas por báscula (RF-05) ---
  router.post(
    '/production/:orderId/requirements/:reqId/deliveries',
    auth,
    perm('delivery:deliver'),
    validate({ body: deliveryRegisterSchema }),
    c.deliveryController.register,
  );

  // --- Ventas (registro diario) ---
  router.get('/sales', auth, perm('sales:read'), validate({ query: salesQuerySchema }), c.salesController.list);
  router.get('/sales/day', auth, perm('sales:read'), validate({ query: saleDayQuerySchema }), c.salesController.getDay);
  router.post('/sales', auth, perm('sales:create'), validate({ body: saleRecordSchema }), c.salesController.register);

  // --- Gastos ---
  router.get('/expenses', auth, perm('expenses:read'), validate({ query: expensesQuerySchema }), c.expensesController.list);
  router.post('/expenses', auth, perm('expenses:create'), validate({ body: expenseSchema }), c.expensesController.create);
  router.put('/expenses/:id', auth, perm('expenses:update'), validate({ body: expenseSchema.partial() }), c.expensesController.update);

  // --- Dashboard y centro de alertas ---
  router.get('/dashboard/summary', auth, perm('dashboard:read'), validate({ query: dashboardQuerySchema }), c.dashboardController.summary);
  router.get('/alerts', auth, perm('dashboard:read'), validate({ query: alertsQuerySchema }), c.dashboardController.alerts);
  router.post('/alerts/:id/read', auth, perm('dashboard:read'), c.dashboardController.markAlertRead);

  // --- Usuarios (administración) ---
  router.get('/users', auth, perm('users:read'), validate({ query: usersQuerySchema }), c.usersController.list);
  router.get('/users/roles', auth, perm('users:read'), c.usersController.roles);
  router.post('/users', auth, perm('users:create'), validate({ body: userCreateSchema }), c.usersController.create);
  router.put('/users/:id', auth, perm('users:update'), validate({ body: userUpdateSchema }), c.usersController.update);
  router.post('/users/:id/deactivate', auth, perm('users:deactivate'), c.usersController.deactivate);
  router.post('/users/:id/reset-password', auth, perm('users:update'), validate({ body: userResetPasswordSchema }), c.usersController.resetPassword);

  // --- Configuración del sistema ---
  router.get('/settings', auth, perm('settings:read'), c.settingsController.get);
  router.put('/settings', auth, perm('settings:update'), validate({ body: settingsUpdateSchema }), c.settingsController.update);

  // --- Horarios de empleadas (Fase 19) ---
  router.get('/employees', auth, perm('employees:read'), validate({ query: employeesQuerySchema }), c.schedulesController.listEmployees);
  router.post('/employees', auth, perm('employees:create'), validate({ body: employeeSchema }), c.schedulesController.createEmployee);
  router.put('/employees/:id', auth, perm('employees:update'), validate({ body: employeeSchema.partial() }), c.schedulesController.updateEmployee);
  router.post('/employees/:id/deactivate', auth, perm('employees:deactivate'), c.schedulesController.deactivateEmployee);
  router.get('/schedules', auth, perm('schedules:read'), validate({ query: scheduleMonthQuerySchema }), c.schedulesController.getMonth);
  router.get('/schedules/export', auth, perm('schedules:read'), validate({ query: scheduleMonthQuerySchema }), c.schedulesController.exportXlsx);
  router.post('/schedules/generate', auth, perm('schedules:generate'), validate({ body: scheduleGenerateSchema }), c.schedulesController.generate);
  router.put('/schedules/:id/assignments', auth, perm('schedules:update'), validate({ body: shiftAssignmentUpdateSchema }), c.schedulesController.updateAssignment);
  router.post('/schedules/:id/publish', auth, perm('schedules:publish'), c.schedulesController.publish);

  // --- Cocina: monitor de solo lectura (RF-11) ---
  router.get('/kitchen/summary', auth, perm('kitchen:read'), validate({ query: kitchenSummaryQuerySchema }), c.kitchenController.summary);

  // --- Reportes (RF-12) ---
  router.get('/reports', auth, perm('reports:read'), validate({ query: reportsQuerySchema }), c.reportsController.list);
  router.get('/reports/:type', auth, perm('reports:generate'), validate({ query: reportRangeQuerySchema }), c.reportsController.generate);
  router.post('/reports/:type/export', auth, perm('reports:export'), validate({ body: reportExportSchema }), c.reportsController.export);
  router.get('/reports/:id/download', auth, perm('reports:read'), c.reportsController.download);

  // --- Auditoría (RF-13.1) ---
  router.get('/audit', auth, perm('audit:read'), validate({ query: auditQuerySchema }), c.auditController.list);

  // --- Respaldos (RF-13.2) ---
  router.get('/backups', auth, perm('backups:read'), validate({ query: backupsQuerySchema }), c.backupsController.list);
  router.post('/backups', auth, perm('backups:create'), c.backupsController.create);
  router.get('/backups/:id/download', auth, perm('backups:read'), c.backupsController.download);
  router.post('/backups/:id/restore', auth, perm('backups:restore'), validate({ body: backupRestoreSchema }), c.backupsController.restore);

  // --- Solo desarrollo: probar el bus de eventos sin casos de uso mutadores ---
  if (isDev) {
    router.post('/dev/realtime-test', auth, (req, res) => {
      c.eventBus.publish(
        'alert:new',
        {
          alertId: 'dev-test',
          type: 'dev',
          message: `Prueba de tiempo real enviada por ${req.user?.username}`,
        },
        [SOCKET_ROOMS.ADMIN],
      );
      res.json({ data: { sent: true } });
    });
  }

  return router;
}
