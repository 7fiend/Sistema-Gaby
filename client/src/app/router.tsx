import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { RequireAuth } from './guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DeliveryPage } from '@/features/delivery/DeliveryPage';
import { DeliveryOrderPickerPage } from '@/features/delivery/DeliveryOrderPickerPage';
import { KitchenPage } from '@/features/kitchen/KitchenPage';
import { ProductsPage } from '@/features/inventory/ProductsPage';
import { ProductDetailPage } from '@/features/inventory/ProductDetailPage';
import { RecipesPage } from '@/features/recipes/RecipesPage';
import { RecipeEditorPage } from '@/features/recipes/RecipeEditorPage';
import { RecipeDetailPage } from '@/features/recipes/RecipeDetailPage';
import { ProductionPage } from '@/features/production/ProductionPage';
import { ProductionCreatePage } from '@/features/production/ProductionCreatePage';
import { ProductionDetailPage } from '@/features/production/ProductionDetailPage';
import { SalesPage } from '@/features/sales/SalesPage';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { UsersPage } from '@/features/users/UsersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { BackupsPage } from '@/features/backups/BackupsPage';
import { CategoriesPage } from '@/features/categories/CategoriesPage';
import { WeeklyMenuPage } from '@/features/weeklyMenu/WeeklyMenuPage';
import { TodayMenuPage } from '@/features/weeklyMenu/TodayMenuPage';
import { RoutineConsumptionPage } from '@/features/delivery/RoutineConsumptionPage';
import { SchedulesPage } from '@/features/schedules/SchedulesPage';

/**
 * Rutas de los tres módulos, protegidas por permiso de la matriz compartida.
 * El backend re-valida todo; estos guards son experiencia de usuario.
 */
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth permission="dashboard:read" />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'produccion', element: <ProductionPage /> },
          { path: 'produccion/nueva', element: <ProductionCreatePage /> },
          { path: 'produccion/:id', element: <ProductionDetailPage /> },
          { path: 'recetas', element: <RecipesPage /> },
          { path: 'recetas/nueva', element: <RecipeEditorPage /> },
          { path: 'recetas/:id', element: <RecipeDetailPage /> },
          { path: 'menu-semanal', element: <WeeklyMenuPage /> },
          { path: 'menu-hoy', element: <TodayMenuPage /> },
          { path: 'horarios', element: <SchedulesPage /> },
          { path: 'inventario', element: <ProductsPage /> },
          { path: 'inventario/:id', element: <ProductDetailPage /> },
          { path: 'ventas', element: <SalesPage /> },
          { path: 'gastos', element: <ExpensesPage /> },
          { path: 'reportes', element: <ReportsPage /> },
          { path: 'usuarios', element: <UsersPage /> },
          { path: 'auditoria', element: <AuditPage /> },
          { path: 'respaldos', element: <BackupsPage /> },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'configuracion', element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth permission="delivery:read" />,
    children: [
      { path: '/bodega', element: <DeliveryOrderPickerPage /> },
      { path: '/bodega/:orderId', element: <DeliveryPage /> },
    ],
  },
  {
    element: <RequireAuth permission="routine:register" />,
    children: [{ path: '/bodega/rutina-aseo', element: <RoutineConsumptionPage /> }],
  },
  {
    element: <RequireAuth permission="kitchen:read" />,
    children: [{ path: '/cocina', element: <KitchenPage /> }],
  },
]);
