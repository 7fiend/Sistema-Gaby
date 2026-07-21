/**
 * Prueba E2E de la entrega 9c: dashboard + alertas + usuarios + configuración.
 * Verifica: series de 14 días coherentes, KPIs que reaccionan a datos nuevos,
 * centro de alertas (leer/marcar), CRUD de usuarios con revocación de sesiones,
 * candados de auto-edición, configuración con validación y permisos.
 * Requiere el server corriendo (npm run dev). Re-ejecutable.
 */
const BASE = 'http://localhost:3000/api/v1';
let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

async function req<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = (await res.json()) as { data?: T; error?: { code: string; message: string } };
  if (!res.ok) throw Object.assign(new Error(body.error?.message), { code: body.error?.code });
  return body.data as T;
}

/** Login que además captura la cookie del refresh token (prueba de revocación). */
async function loginFull(username: string, password = 'Gaby2026*') {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as {
    data?: { accessToken: string };
    error?: { code: string };
  };
  if (!res.ok) throw Object.assign(new Error('login failed'), { code: body.error?.code });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return { token: body.data!.accessToken, cookie };
}

const { token } = await loginFull('admin');
const me = await req<{ id: string; username: string }>('/auth/me', token);

// =============================== 1. DASHBOARD ===============================
type Day = { date: string; sales: number; productionCost: number; expenses: number; profit: number };
type Summary = {
  kpis: {
    salesToday: number; salesYesterday: number;
    productionCostToday: number; expensesToday: number;
    profitToday: number; portionsToday: number;
  };
  days: Day[];
  topRecipes: { recipeId: string; name: string; portions: number; total: number }[];
  topIngredients: { productId: string; name: string; quantity: number; unit: string; estimatedCost: number }[];
};

const today = new Date().toLocaleDateString('en-CA');
const before = await req<Summary>(`/dashboard/summary?date=${today}`, token);

check('serie de 14 días completa', before.days.length === 14, `${before.days.length} días`);
check('último día de la serie = hoy', before.days[13]!.date === today, before.days[13]!.date);
check(
  'serie en orden ascendente sin huecos',
  before.days.every((d, i) => i === 0 || d.date > before.days[i - 1]!.date),
);
check(
  'utilidad = ventas − costo − gastos en cada día',
  before.days.every((d) => Math.abs(d.profit - (d.sales - d.productionCost - d.expenses)) < 0.01),
);
check(
  'KPIs de hoy = última fila de la serie',
  before.kpis.salesToday === before.days[13]!.sales &&
    before.kpis.expensesToday === before.days[13]!.expenses &&
    before.kpis.profitToday === before.days[13]!.profit,
);

// Un gasto nuevo debe mover el KPI y la serie exactamente en su monto
const cats = await req<{ id: string }[]>('/catalog/categories?kind=EXPENSE', token);
const AMOUNT = 12345;
await req('/expenses', token, {
  method: 'POST',
  body: JSON.stringify({ categoryId: cats[0]!.id, amount: AMOUNT, date: today, description: 'Gasto de prueba E2E 9c' }),
});
const after = await req<Summary>(`/dashboard/summary?date=${today}`, token);
check(
  'KPI de gastos reacciona al gasto nuevo (+12.345)',
  Math.abs(after.kpis.expensesToday - before.kpis.expensesToday - AMOUNT) < 0.01,
  `${before.kpis.expensesToday} → ${after.kpis.expensesToday}`,
);
check(
  'utilidad de hoy baja en el mismo monto',
  Math.abs(before.kpis.profitToday - after.kpis.profitToday - AMOUNT) < 0.01,
);

// Ventas de hoy (si ya existía el registro del día, el CONFLICT es esperado)
const recipes = await req<{ items: { id: string; name: string; suggestedPrice: number }[] }>(
  '/recipes?pageSize=100',
  token,
);
const almuerzo = recipes.items.find((r) => r.name === 'Almuerzo Ejecutivo')!;
try {
  await req('/sales', token, {
    method: 'POST',
    body: JSON.stringify({
      date: today,
      notes: 'Venta de prueba E2E 9c',
      items: [{ recipeId: almuerzo.id, portions: 7, unitPrice: almuerzo.suggestedPrice }],
    }),
  });
} catch (e) {
  if ((e as { code?: string }).code !== 'CONFLICT') throw e;
}
const withSales = await req<Summary>(`/dashboard/summary?date=${today}`, token);
check('top de recetas con datos en la ventana', withSales.topRecipes.length > 0);
check('KPI de porciones vendidas > 0', withSales.kpis.portionsToday > 0);

// ================================ 2. ALERTAS ================================
type Alert = { id: string; type: string; message: string; isRead: boolean };

// Forzar una alerta stock_low real: salida que cruza el mínimo + compensación
const products = await req<{ items: { id: string; name: string; currentStock: number; minStock: number }[] }>(
  '/products?pageSize=100',
  token,
);
const victim = products.items.find((p) => p.currentStock > p.minStock + 1)!;
check('producto con stock sobre el mínimo para la prueba', !!victim, victim?.name);
const outQty = victim.currentStock - victim.minStock + 0.5;
await req('/inventory/adjustments', token, {
  method: 'POST',
  body: JSON.stringify({ productId: victim.id, type: 'ADJUSTMENT_OUT', quantity: outQty, reason: 'Prueba E2E 9c: forzar stock bajo' }),
});
await req('/inventory/adjustments', token, {
  method: 'POST',
  body: JSON.stringify({ productId: victim.id, type: 'ADJUSTMENT_IN', quantity: outQty, reason: 'Prueba E2E 9c: compensación' }),
});

const alerts = await req<Alert[]>('/alerts?limit=50', token);
const lowAlert = alerts.find((a) => a.type === 'stock_low' && a.message.includes(victim.name));
check('alerta stock_low generada y visible en GET /alerts', !!lowAlert);

if (lowAlert) {
  await req(`/alerts/${lowAlert.id}/read`, token, { method: 'POST' });
  const afterRead = await req<Alert[]>('/alerts?limit=50', token);
  check('marcar leída la saca del centro de alertas', !afterRead.some((a) => a.id === lowAlert.id));
}
try {
  await req('/alerts/no-existe/read', token, { method: 'POST' });
  check('marcar alerta inexistente rechazado', false);
} catch (e) {
  check('marcar alerta inexistente rechazado (NOT_FOUND)', (e as { code?: string }).code === 'NOT_FOUND');
}

// =============================== 3. USUARIOS ================================
type UserItem = { id: string; username: string; fullName: string; isActive: boolean; role: { id: string; name: string } };
type Paginated<T> = { items: T[]; total: number };

const roles = await req<{ id: string; name: string }[]>('/users/roles', token);
check('roles del sistema listados', roles.length >= 4, roles.map((r) => r.name).join(', '));
const kitchenRole = roles.find((r) => r.name === 'KITCHEN')!;
const auditorRole = roles.find((r) => r.name === 'AUDITOR')!;

const list = await req<Paginated<UserItem>>('/users?pageSize=100', token);
check('listado de usuarios incluye a admin', list.items.some((u) => u.username === 'admin'));

// Crear (o reactivar si quedó de una corrida anterior)
const PASS1 = 'Prueba9c*A1';
const PASS2 = 'Prueba9c*B2';
let testUser: UserItem;
try {
  testUser = await req<UserItem>('/users', token, {
    method: 'POST',
    body: JSON.stringify({
      username: 'test9c',
      fullName: 'Usuario Prueba 9c',
      email: '',
      roleId: kitchenRole.id,
      password: PASS1,
    }),
  });
  check('usuario test9c creado', testUser.username === 'test9c');
} catch (e) {
  check('username duplicado rechazado (CONFLICT, corrida repetida)', (e as { code?: string }).code === 'CONFLICT');
  const found = await req<Paginated<UserItem>>('/users?search=test9c&includeInactive=true', token);
  testUser = found.items[0]!;
  await req(`/users/${testUser.id}`, token, {
    method: 'PUT',
    body: JSON.stringify({ isActive: true, roleId: kitchenRole.id }),
  });
  await req(`/users/${testUser.id}/reset-password`, token, {
    method: 'POST',
    body: JSON.stringify({ newPassword: PASS1 }),
  });
}

// Duplicado directo
try {
  await req('/users', token, {
    method: 'POST',
    body: JSON.stringify({ username: 'test9c', fullName: 'Duplicado', roleId: kitchenRole.id, password: PASS1 }),
  });
  check('username duplicado rechazado', false);
} catch (e) {
  check('username duplicado rechazado (CONFLICT)', (e as { code?: string }).code === 'CONFLICT');
}

// Login del usuario nuevo + revocación de sesión al cambiar rol
const session1 = await loginFull('test9c', PASS1);
check('login del usuario nuevo funciona', session1.token.length > 0);

await req(`/users/${testUser.id}`, token, {
  method: 'PUT',
  body: JSON.stringify({ roleId: auditorRole.id }),
});
const refreshRes = await fetch(`${BASE}/auth/refresh`, {
  method: 'POST',
  headers: { Cookie: session1.cookie },
});
check('cambiar rol revoca sesiones (refresh → 401)', refreshRes.status === 401, `status ${refreshRes.status}`);

// Candados de auto-edición
try {
  await req(`/users/${me.id}`, token, { method: 'PUT', body: JSON.stringify({ roleId: kitchenRole.id }) });
  check('cambiar mi propio rol rechazado', false);
} catch (e) {
  check('cambiar mi propio rol rechazado (VALIDATION_ERROR)', (e as { code?: string }).code === 'VALIDATION_ERROR');
}
try {
  await req(`/users/${me.id}/deactivate`, token, { method: 'POST' });
  check('desactivar mi propia cuenta rechazado', false);
} catch (e) {
  check('desactivar mi propia cuenta rechazado (VALIDATION_ERROR)', (e as { code?: string }).code === 'VALIDATION_ERROR');
}

// Reset de contraseña: la vieja muere, la nueva sirve
await req(`/users/${testUser.id}/reset-password`, token, {
  method: 'POST',
  body: JSON.stringify({ newPassword: PASS2 }),
});
try {
  await loginFull('test9c', PASS1);
  check('contraseña vieja rechazada tras reset', false);
} catch (e) {
  check('contraseña vieja rechazada tras reset', (e as { code?: string }).code === 'INVALID_CREDENTIALS');
}
const session2 = await loginFull('test9c', PASS2);
check('contraseña nueva funciona', session2.token.length > 0);

// Contraseña débil rechazada por Zod compartido
try {
  await req(`/users/${testUser.id}/reset-password`, token, {
    method: 'POST',
    body: JSON.stringify({ newPassword: 'corta' }),
  });
  check('contraseña débil rechazada', false);
} catch (e) {
  check('contraseña débil rechazada (VALIDATION_ERROR)', (e as { code?: string }).code === 'VALIDATION_ERROR');
}

// Desactivar: el login muere
await req(`/users/${testUser.id}/deactivate`, token, { method: 'POST' });
try {
  await loginFull('test9c', PASS2);
  check('login de cuenta desactivada rechazado', false);
} catch (e) {
  check('login de cuenta desactivada rechazado', (e as { code?: string }).code === 'INVALID_CREDENTIALS');
}

// Permisos: cocina no ve usuarios ni dashboard
const { token: tokenK } = await loginFull('cocina');
for (const [name, path] of [
  ['usuarios', '/users?page=1'],
  ['dashboard', `/dashboard/summary?date=${today}`],
  ['alertas', '/alerts'],
] as const) {
  try {
    await req(path, tokenK);
    check(`cocina bloqueada en ${name}`, false);
  } catch (e) {
    check(`cocina bloqueada en ${name} (FORBIDDEN)`, (e as { code?: string }).code === 'FORBIDDEN');
  }
}

// ============================= 4. CONFIGURACIÓN =============================
type Settings = { toleranceKg: number; expiryAlertDays: number; backupSchedule: string; defaultMarginPct: number };
const settings = await req<Settings>('/settings', token);
check(
  'GET /settings devuelve los parámetros',
  typeof settings.toleranceKg === 'number' && typeof settings.backupSchedule === 'string',
  `tolerancia ${settings.toleranceKg} kg, cron "${settings.backupSchedule}"`,
);

const newDays = settings.expiryAlertDays === 7 ? 6 : 7;
const updated = await req<Settings>('/settings', token, {
  method: 'PUT',
  body: JSON.stringify({ expiryAlertDays: newDays }),
});
check('PUT /settings aplica el cambio', updated.expiryAlertDays === newDays);
const reread = await req<Settings>('/settings', token);
check('el cambio persiste', reread.expiryAlertDays === newDays);
await req('/settings', token, {
  method: 'PUT',
  body: JSON.stringify({ expiryAlertDays: settings.expiryAlertDays }),
});
check(
  'restaurado el valor original',
  (await req<Settings>('/settings', token)).expiryAlertDays === settings.expiryAlertDays,
);

try {
  await req('/settings', token, { method: 'PUT', body: JSON.stringify({ toleranceKg: -1 }) });
  check('tolerancia negativa rechazada', false);
} catch (e) {
  check('tolerancia negativa rechazada (VALIDATION_ERROR)', (e as { code?: string }).code === 'VALIDATION_ERROR');
}
try {
  await req('/settings', token, { method: 'PUT', body: JSON.stringify({ backupSchedule: 'no-es-cron' }) });
  check('cron inválido rechazado', false);
} catch (e) {
  check('cron inválido rechazado (VALIDATION_ERROR)', (e as { code?: string }).code === 'VALIDATION_ERROR');
}

// Auditor: lee configuración pero no puede editarla
const { token: tokenA } = await loginFull('auditor');
const auditorSettings = await req<Settings>('/settings', tokenA);
check('auditor puede leer configuración', typeof auditorSettings.toleranceKg === 'number');
try {
  await req('/settings', tokenA, { method: 'PUT', body: JSON.stringify({ expiryAlertDays: 9 }) });
  check('auditor bloqueado al editar configuración', false);
} catch (e) {
  check('auditor bloqueado al editar configuración (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
