import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ChefHat,
  BookOpenText,
  Boxes,
  Receipt,
  Wallet,
  BarChart3,
  Users,
  ScrollText,
  DatabaseBackup,
  Settings,
  Moon,
  Sun,
  LogOut,
  CalendarDays,
  CalendarCheck,
  Tags,
} from 'lucide-react';
import { useTheme } from '@/stores/theme';
import { useAuth } from '@/stores/auth';
import { useRealtime } from '@/stores/realtime';
import { logout } from '@/features/auth/api';
import { cn } from '@/lib/utils';

/** Indicador permanente de conexión en tiempo real (Fase 4 §1.4). */
function RealtimeIndicator() {
  const status = useRealtime((s) => s.status);
  const label =
    status === 'connected' ? 'en vivo' : status === 'connecting' ? 'conectando…' : 'sin conexión';
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        status === 'connected' ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'size-2 rounded-full',
          status === 'connected' && 'bg-primary',
          status === 'connecting' && 'animate-pulse bg-warning',
          status === 'disconnected' && 'bg-destructive',
        )}
      />
      {label}
    </span>
  );
}

const operacion = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/produccion', label: 'Producción', icon: ChefHat },
  { to: '/admin/menu-hoy', label: 'Menú de hoy', icon: CalendarCheck },
  { to: '/admin/recetas', label: 'Recetas', icon: BookOpenText },
  { to: '/admin/menu-semanal', label: 'Menú semanal', icon: CalendarDays },
  { to: '/admin/inventario', label: 'Inventario', icon: Boxes },
  { to: '/admin/ventas', label: 'Ventas', icon: Receipt },
  { to: '/admin/gastos', label: 'Gastos', icon: Wallet },
  { to: '/admin/reportes', label: 'Reportes', icon: BarChart3 },
];

const sistema = [
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { to: '/admin/categorias', label: 'Categorías', icon: Tags },
  { to: '/admin/auditoria', label: 'Auditoría', icon: ScrollText },
  { to: '/admin/respaldos', label: 'Respaldos', icon: DatabaseBackup },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
];

function NavItem({ to, label, icon: Icon, end }: (typeof operacion)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
          isActive && 'bg-accent font-medium text-accent-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </NavLink>
  );
}

export function AdminLayout() {
  const { theme, toggle } = useTheme();
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();

  const initials = (user?.fullName ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="grid min-h-dvh grid-cols-[210px_1fr]">
      <aside className="flex flex-col border-r bg-card px-2 py-4">
        <div className="mb-4 flex items-center gap-2 px-3">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            G
          </span>
          <span className="text-sm font-semibold">Sistema Gaby</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {operacion.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <div className="my-3 border-t" />
          {sistema.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-13 items-center gap-3 border-b bg-card px-5 py-2.5">
          <RealtimeIndicator />
          <div className="flex-1" />
          <button
            type="button"
            onClick={toggle}
            aria-label="Cambiar tema"
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </span>
            <span className="hidden text-sm sm:block">{user?.fullName}</span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </header>
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
