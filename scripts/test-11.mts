/**
 * Prueba E2E de la Fase 11: módulo Cocina (monitor de solo lectura).
 * Verifica: agregación por receta en `GET /kitchen/summary` (porciones e
 * ingredientes escalados a la versión vigente), que `deliveredPct` sube tras
 * una entrega real (reutiliza el endpoint de la Fase 10), las transiciones
 * nuevas DELIVERED→IN_PREPARATION→COMPLETED (genéricas, admin) y permisos
 * (`cocina` solo lee `/kitchen/summary`, nunca `/recipes` ni transiciona).
 * Requiere el server corriendo (npm run dev) y el seed actualizado
 * (permisos production:start/production:complete).
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

// --- Tipos locales ---
type Paginated<T> = { items: T[]; total: number };
type Product = { id: string; code: string; name: string; unit: { abbreviation: string } };
type Recipe = { id: string; name: string; yieldPortions: number };
type RecipeDetail = Recipe & { ingredients: { productId: string; quantity: number; unit: { id: string } }[] };
type Requirement = { id: string; productId: string; productName: string; requiredQuantity: number; deliveredQuantity: number; status: string };
type Order = { id: string; orderNumber: string; status: string; requirements: Requirement[] };
type KitchenCard = {
  recipeId: string;
  recipeName: string;
  totalPortions: number;
  deliveredPct: number;
  ingredients: { productName: string; quantity: number; unitAbbreviation: string }[];
  steps: string[];
};
type KitchenSummary = { date: string; recipes: KitchenCard[] };

// --- Datos base ---
const recipes = await req<Paginated<Recipe>>('/recipes?search=Almuerzo+Ejecutivo', token);
const almuerzo = recipes.items.find((r) => r.name === 'Almuerzo Ejecutivo')!;
const almuerzoDetail = await req<RecipeDetail>(`/recipes/${almuerzo.id}`, token);
check('receta Almuerzo Ejecutivo encontrada', !!almuerzo, `yield=${almuerzo.yieldPortions}`);

// Porciones grandes a propósito: otras corridas de test-10/test-11 pueden dejar
// órdenes de "Almuerzo Ejecutivo" activas de HOY, y `/kitchen/summary` agrega
// TODAS las órdenes del día para esa receta. Con un peso dominante, el cambio
// de `deliveredPct` tras una sola entrega sigue siendo visible aunque se
// redondee a entero (con 1-2 porciones el corrimiento se pierde en el redondeo).
// 300 en vez de 50 (Fase 15): con muchas corridas acumuladas en el mismo día,
// 50 porciones dejó de ser suficientemente dominante frente al resto — es una
// mitigación, no una solución definitiva (cualquier número fijo eventualmente
// se diluye con suficientes corridas el mismo día; se resetea solo mañana,
// porque /kitchen/summary agrega únicamente el día de hoy).
const PORTIONS = 300;
const scale = PORTIONS / almuerzo.yieldPortions;

// Stock de sobra (con margen) para completar TODA la orden sin depender de otras corridas.
const TEST_BATCH = `TEST-11-${Date.now()}`;
for (const ing of almuerzoDetail.ingredients) {
  const product = await req<Product>(`/products/${ing.productId}`, token);
  const needed = Math.ceil(ing.quantity * scale + 10);
  await req('/inventory/entries', token, {
    method: 'POST',
    body: JSON.stringify({ productId: ing.productId, quantity: needed, unitCost: 1, batchNumber: `${TEST_BATCH}-${product.code}` }),
  });
}

// --- 1. Crear y confirmar una orden de hoy ---
const today = new Date().toISOString().slice(0, 10);
const draft = await req<Order>('/production', token, {
  method: 'POST',
  body: JSON.stringify({
    date: today,
    notes: 'Orden de prueba E2E 11',
    items: [{ recipeId: almuerzo.id, portions: PORTIONS }],
  }),
});
const { order: confirmed } = await req<{ order: Order }>(`/production/${draft.id}/confirm`, token, {
  method: 'POST',
});
check('orden confirmada', confirmed.status === 'CONFIRMED', confirmed.orderNumber);

// --- 2. Transición inválida antes de tiempo ---
try {
  await req(`/production/${draft.id}/start`, token, { method: 'POST' });
  check('iniciar preparación antes de DELIVERED rechazado', false);
} catch (e) {
  check(
    'iniciar preparación antes de DELIVERED rechazado (INVALID_TRANSITION)',
    (e as { code?: string }).code === 'INVALID_TRANSITION',
  );
}

// --- 3. GET /kitchen/summary (admin): porciones e ingredientes escalados ---
const summaryBefore = await req<KitchenSummary>('/kitchen/summary', token);
const cardBefore = summaryBefore.recipes.find((r) => r.recipeId === almuerzo.id)!;
check('receta aparece en el resumen de cocina', !!cardBefore);
check('totalPortions incluye al menos las de esta orden', cardBefore.totalPortions >= PORTIONS, `${cardBefore.totalPortions}`);
check('pasos de la receta presentes', cardBefore.steps.length > 0);

// Invariante robusta frente a otras órdenes de hoy que compartan la receta:
// cantidad_ingrediente / totalPortions == cantidad_receta / yieldPortions (misma escala).
let scalingOk = true;
for (const ing of almuerzoDetail.ingredients) {
  const expectedPerPortion = ing.quantity / almuerzo.yieldPortions;
  const detail = await req<Product>(`/products/${ing.productId}`, token);
  const line = cardBefore.ingredients.find((i) => i.productName === detail.name);
  if (!line) { scalingOk = false; continue; }
  const actualPerPortion = line.quantity / cardBefore.totalPortions;
  if (Math.abs(actualPerPortion - expectedPerPortion) > 0.001) scalingOk = false;
}
check('ingredientes escalados proporcionalmente a la versión vigente', scalingOk);

// --- 4. Entregar UN insumo y verificar que deliveredPct sube ---
// El insumo de MAYOR requiredQuantity (no "el primero del array", que puede
// ser uno insignificante frente al resto): kitchenSummary suma cantidades
// crudas entre insumos de distinta unidad, así que entregar completo un
// insumo pequeño (ej. sal, 0.1 kg) apenas mueve el % agregado de la orden
// aunque la orden misma sea grande — ver nota de PORTIONS arriba.
const firstReq = confirmed.requirements.reduce((max, r) =>
  r.requiredQuantity > max.requiredQuantity ? r : max,
);
await req(`/production/${draft.id}/requirements/${firstReq.id}/deliveries`, token, {
  method: 'POST',
  body: JSON.stringify({ quantity: firstReq.requiredQuantity, mode: 'complete', source: 'SIMULATOR', readings: [] }),
});
const summaryAfter = await req<KitchenSummary>('/kitchen/summary', token);
const cardAfter = summaryAfter.recipes.find((r) => r.recipeId === almuerzo.id)!;
check(
  'deliveredPct sube tras una entrega real',
  cardAfter.deliveredPct > cardBefore.deliveredPct,
  `${cardBefore.deliveredPct}% → ${cardAfter.deliveredPct}%`,
);

// --- 5. Completar el resto de insumos hasta DELIVERED ---
let order = (await req<Order>(`/production/${draft.id}`, token));
for (const r of order.requirements) {
  if (r.status === 'DELIVERED') continue;
  const pending = Math.round((r.requiredQuantity - r.deliveredQuantity) * 1000) / 1000;
  if (pending <= 0) continue;
  await req(`/production/${draft.id}/requirements/${r.id}/deliveries`, token, {
    method: 'POST',
    body: JSON.stringify({ quantity: pending, mode: 'complete', source: 'SIMULATOR', readings: [] }),
  });
}
order = await req<Order>(`/production/${draft.id}`, token);
check('orden queda DELIVERED', order.status === 'DELIVERED', order.status);

// --- 6. Transiciones nuevas: DELIVERED → IN_PREPARATION → COMPLETED ---
const started = await req<Order>(`/production/${draft.id}/start`, token, { method: 'POST' });
check('iniciar preparación → IN_PREPARATION', started.status === 'IN_PREPARATION');

try {
  await req(`/production/${draft.id}/start`, token, { method: 'POST' });
  check('reiniciar preparación ya iniciada rechazado', false);
} catch (e) {
  check('reiniciar preparación ya iniciada rechazado (INVALID_TRANSITION)', (e as { code?: string }).code === 'INVALID_TRANSITION');
}

const completed = await req<Order>(`/production/${draft.id}/complete`, token, { method: 'POST' });
check('marcar completada → COMPLETED', completed.status === 'COMPLETED');

try {
  await req(`/production/${draft.id}/complete`, token, { method: 'POST' });
  check('completar de nuevo una orden ya completada rechazado', false);
} catch (e) {
  check('completar de nuevo una orden ya completada rechazado (INVALID_TRANSITION)', (e as { code?: string }).code === 'INVALID_TRANSITION');
}

// --- 7. Permisos ---
const tokenCocina = await login('cocina');
const summaryCocina = await req<KitchenSummary>('/kitchen/summary', tokenCocina);
check('cocina puede leer /kitchen/summary', Array.isArray(summaryCocina.recipes));

try {
  await req('/recipes', tokenCocina);
  check('cocina bloqueada al leer /recipes', false);
} catch (e) {
  check('cocina bloqueada al leer /recipes (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

try {
  await req(`/production/${draft.id}/start`, tokenCocina, { method: 'POST' });
  check('cocina bloqueada al iniciar preparación', false);
} catch (e) {
  check('cocina bloqueada al iniciar preparación (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

try {
  await req(`/production/${draft.id}/complete`, tokenCocina, { method: 'POST' });
  check('cocina bloqueada al completar', false);
} catch (e) {
  check('cocina bloqueada al completar (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
