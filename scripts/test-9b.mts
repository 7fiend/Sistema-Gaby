/**
 * Prueba E2E de la entrega 9b: producción diaria + ventas + gastos.
 * Verifica: consecutivo de orden, explosión consolidada entre recetas,
 * snapshots de costo al confirmar, tolerancia congelada, máquina de estados,
 * unicidad de ventas por fecha, CRUD de gastos y permisos.
 * Requiere el server corriendo (npm run dev).
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

async function login(username: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Gaby2026*' }),
  });
  return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
}

const token = await login('admin');

// --- Datos base ---
type Paginated<T> = { items: T[]; total: number };
type Recipe = { id: string; name: string; yieldPortions: number; costPerPortion: number; suggestedPrice: number };
type RecipeDetail = Recipe & {
  ingredients: { productId: string; productName: string; quantity: number; unit: { id: string } }[];
};
type Unit = { id: string; abbreviation: string; factorToBase: number };

const recipes = await req<Paginated<Recipe>>('/recipes?pageSize=100', token);
const almuerzo = recipes.items.find((r) => r.name === 'Almuerzo Ejecutivo')!;
const bandeja = recipes.items.find((r) => r.name === 'Bandeja Especial')!;
check('recetas base encontradas', !!almuerzo && !!bandeja);

const units = await req<Unit[]>('/catalog/units', token);
const almuerzoDetail = await req<RecipeDetail>(`/recipes/${almuerzo.id}`, token);
const bandejaDetail = await req<RecipeDetail>(`/recipes/${bandeja.id}`, token);

// Explosión esperada, calculada de forma independiente al backend
const PORTIONS = { almuerzo: 20, bandeja: 10 };
const expected = new Map<string, { name: string; qty: number }>();
for (const [detail, portions] of [
  [almuerzoDetail, PORTIONS.almuerzo],
  [bandejaDetail, PORTIONS.bandeja],
] as const) {
  const scale = portions / detail.yieldPortions;
  for (const ing of detail.ingredients) {
    const factor = units.find((u) => u.id === ing.unit.id)!.factorToBase;
    const prev = expected.get(ing.productId)?.qty ?? 0;
    expected.set(ing.productId, { name: ing.productName, qty: prev + ing.quantity * factor * scale });
  }
}
const sharedIngredients = [...expected.values()].length < almuerzoDetail.ingredients.length + bandejaDetail.ingredients.length;
check('las recetas comparten ingredientes (consolidación aplica)', sharedIngredients);

// --- 1. Crear orden DRAFT ---
type Availability = { productId: string; productName: string; required: number; available: number; missing: number }[];
type Order = {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
  totalPortions: number;
  totalCostSnapshot: number;
  items: { recipeId: string; portions: number; costPerPortionSnapshot: number; totalCostSnapshot: number; versionNumber: number }[];
  requirements: { productId: string; requiredQuantity: number; toleranceApplied: number; status: string }[];
};

const today = new Date().toISOString().slice(0, 10);
const order = await req<Order>('/production', token, {
  method: 'POST',
  body: JSON.stringify({
    date: today,
    notes: 'Orden de prueba E2E 9b',
    items: [
      { recipeId: almuerzo.id, portions: PORTIONS.almuerzo },
      { recipeId: bandeja.id, portions: PORTIONS.bandeja },
    ],
  }),
});
check('orden creada en DRAFT', order.status === 'DRAFT', order.orderNumber);
check('consecutivo con formato OP-AAAA-####', /^OP-\d{4}-\d{4}$/.test(order.orderNumber), order.orderNumber);
check('fecha de la orden sin corrimiento de día', order.date.startsWith(today), order.date);
check('porciones totales', order.totalPortions === PORTIONS.almuerzo + PORTIONS.bandeja);
check('sin requirements en borrador', order.requirements.length === 0);

// --- 2. Disponibilidad (explosión estimada del borrador) ---
const availability = await req<Availability>(`/production/${order.id}/availability`, token);
let explosionOk = availability.length === expected.size;
for (const line of availability) {
  const exp = expected.get(line.productId);
  if (!exp || Math.abs(exp.qty - line.required) > 0.001) explosionOk = false;
}
check(
  'explosión consolidada correcta (suma ingredientes compartidos, unidad base)',
  explosionOk,
  `${availability.length} productos`,
);

// --- 3. Confirmar: snapshots + requirements + tolerancia congelada ---
const { order: confirmed, shortages } = await req<{ order: Order; shortages: Availability }>(
  `/production/${order.id}/confirm`,
  token,
  { method: 'POST' },
);
check('orden CONFIRMED', confirmed.status === 'CONFIRMED');
check('requirements materializados', confirmed.requirements.length === expected.size);
const reqOk = confirmed.requirements.every((r) => {
  const exp = expected.get(r.productId);
  return exp && Math.abs(exp.qty - r.requiredQuantity) <= 0.001 && r.status === 'PENDING';
});
check('cantidades requeridas correctas en unidad base', reqOk);
check(
  'tolerancia congelada (global 0.05 kg, sin override)',
  confirmed.requirements.every((r) => r.toleranceApplied === 0.05),
);
const itemAlmuerzo = confirmed.items.find((i) => i.recipeId === almuerzo.id)!;
check(
  'snapshot de costo por porción = costo vigente de la receta',
  Math.abs(itemAlmuerzo.costPerPortionSnapshot - almuerzo.costPerPortion) < 0.01,
  `${itemAlmuerzo.costPerPortionSnapshot} vs ${almuerzo.costPerPortion}`,
);
check(
  'snapshot total = porciones × costo/porción',
  Math.abs(itemAlmuerzo.totalCostSnapshot - itemAlmuerzo.costPerPortionSnapshot * PORTIONS.almuerzo) < 0.01,
);
check('costo total de la orden > 0', confirmed.totalCostSnapshot > 0, `${confirmed.totalCostSnapshot}`);
console.log(`      (faltantes advertidos: ${shortages.length})`);

// --- 4. Máquina de estados ---
try {
  await req(`/production/${order.id}/confirm`, token, { method: 'POST' });
  check('re-confirmar rechazado', false);
} catch (e) {
  check('re-confirmar rechazado (INVALID_TRANSITION)', (e as { code?: string }).code === 'INVALID_TRANSITION');
}
try {
  await req(`/production/${order.id}/close`, token, { method: 'POST' });
  check('cerrar desde CONFIRMED rechazado', false);
} catch (e) {
  check('cerrar desde CONFIRMED rechazado (INVALID_TRANSITION)', (e as { code?: string }).code === 'INVALID_TRANSITION');
}
// cancelar CONFIRMED sin entregas sí es válido
const cancelled = await req<Order>(`/production/${order.id}/cancel`, token, { method: 'POST' });
check('cancelar CONFIRMED sin entregas', cancelled.status === 'CANCELLED');
try {
  await req(`/production/${order.id}/cancel`, token, { method: 'POST' });
  check('re-cancelar rechazado', false);
} catch (e) {
  check('re-cancelar rechazado (INVALID_TRANSITION)', (e as { code?: string }).code === 'INVALID_TRANSITION');
}

// consecutivo: una segunda orden debe incrementar el número
const order2 = await req<Order>('/production', token, {
  method: 'POST',
  body: JSON.stringify({ date: today, items: [{ recipeId: almuerzo.id, portions: 5 }] }),
});
const n1 = Number(order.orderNumber.slice(-4));
const n2 = Number(order2.orderNumber.slice(-4));
check('consecutivo incremental', n2 === n1 + 1, `${order.orderNumber} → ${order2.orderNumber}`);
await req(`/production/${order2.id}/cancel`, token, { method: 'POST' }); // limpieza (soft)

// --- 5. Ventas: registro único por fecha, total en servidor ---
// fecha pasada pseudo-única para poder re-ejecutar la prueba
const offset = 1000 + (Date.now() % 8000);
const saleDate = new Date(Date.now() - offset * 24 * 3600 * 1000).toISOString().slice(0, 10);
type SaleRecord = { id: string; date: string; totalPortions: number; totalAmount: number; items: unknown[] };
const sale = await req<SaleRecord>('/sales', token, {
  method: 'POST',
  body: JSON.stringify({
    date: saleDate,
    notes: 'Prueba E2E 9b',
    items: [
      { recipeId: almuerzo.id, portions: 30, unitPrice: almuerzo.suggestedPrice },
      { recipeId: bandeja.id, portions: 12, unitPrice: 18000 },
    ],
  }),
});
const expectedTotal = 30 * almuerzo.suggestedPrice + 12 * 18000;
check('venta registrada con total calculado en servidor', Math.abs(sale.totalAmount - expectedTotal) < 0.01, `${sale.totalAmount}`);
check('porciones consolidadas', sale.totalPortions === 42);

const day = await req<SaleRecord | null>(`/sales/day?date=${saleDate}`, token);
check('consulta del día devuelve el registro', day?.id === sale.id);
check('fecha de venta sin corrimiento', (day?.date ?? '').startsWith(saleDate), day?.date ?? '');

try {
  await req('/sales', token, {
    method: 'POST',
    body: JSON.stringify({ date: saleDate, items: [{ recipeId: almuerzo.id, portions: 1, unitPrice: 1000 }] }),
  });
  check('fecha duplicada rechazada', false);
} catch (e) {
  check('fecha duplicada rechazada (CONFLICT)', (e as { code?: string }).code === 'CONFLICT');
}

// --- 6. Gastos: crear, listar, corregir ---
type Expense = { id: string; amount: number; description: string; category: { name: string } };
const cats = await req<{ id: string; name: string }[]>('/catalog/categories?kind=EXPENSE', token);
const expense = await req<Expense>('/expenses', token, {
  method: 'POST',
  body: JSON.stringify({
    categoryId: cats[0]!.id,
    amount: 45000,
    date: today,
    description: 'Gasto de prueba E2E 9b',
  }),
});
check('gasto creado', expense.amount === 45000, expense.category.name);
const updated = await req<Expense>(`/expenses/${expense.id}`, token, {
  method: 'PUT',
  body: JSON.stringify({ amount: 52000 }),
});
check('gasto corregido (update parcial)', updated.amount === 52000);
const expensesList = await req<Paginated<Expense>>(`/expenses?search=Prueba+E2E+9b`, token);
check('gasto aparece en el listado filtrado', expensesList.items.some((e) => e.id === expense.id));

// --- 7. Permisos: cocina no puede crear ni confirmar producción ---
const tokenK = await login('cocina');
try {
  await req('/production', tokenK, {
    method: 'POST',
    body: JSON.stringify({ date: today, items: [{ recipeId: almuerzo.id, portions: 1 }] }),
  });
  check('cocina bloqueada al crear producción', false);
} catch (e) {
  check('cocina bloqueada al crear producción (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}
try {
  await req('/sales', tokenK, {
    method: 'POST',
    body: JSON.stringify({ date: today, items: [{ recipeId: almuerzo.id, portions: 1, unitPrice: 100 }] }),
  });
  check('cocina bloqueada al registrar ventas', false);
} catch (e) {
  check('cocina bloqueada al registrar ventas (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
