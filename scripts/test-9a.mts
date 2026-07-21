/**
 * Prueba E2E de la entrega 9a: inventario + recetas.
 * Verifica: promedio ponderado, recálculo en cascada de recetas,
 * consumo FEFO, kardex y validación de stock insuficiente.
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

const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Gaby2026*' }),
});
const token = ((await loginRes.json()) as { data: { accessToken: string } }).data.accessToken;

// --- Estado inicial ---
type Product = { id: string; code: string; currentStock: number; avgCost: number; unit: { abbreviation: string } };
type Paginated<T> = { items: T[]; total: number };
const products = await req<Paginated<Product>>('/products?search=Carne+de+res', token);
const carne = products.items.find((p) => p.code === 'CAR-001')!;
check('producto CAR-001 encontrado', !!carne, `stock=${carne.currentStock}, avg=${carne.avgCost}`);

type Recipe = { id: string; name: string; costPerPortion: number };
const recipes = await req<Paginated<Recipe>>('/recipes?search=Almuerzo', token);
const almuerzo = recipes.items[0]!;
const costBefore = almuerzo.costPerPortion;
check('receta Almuerzo Ejecutivo encontrada', !!almuerzo, `costo/porción=${costBefore}`);

// --- 1. Entrada: 20 kg a $25.000 → promedio ponderado ---
// lotes únicos por corrida para que la prueba sea re-ejecutable indefinidamente
// (no depende del lote sembrado LOTE-INICIAL, que otras corridas históricas
// pueden haber agotado — ver docs/00 §notas operativas).
const TEST_BATCH_FAR = `TEST-9A-FAR-${Date.now()}`;
const TEST_BATCH_NEAR = `TEST-9A-NEAR-${Date.now()}`;
const stockBefore = carne.currentStock;
const avgBefore = carne.avgCost;
const expectedAvg = Math.round(((stockBefore * avgBefore + 20 * 25000) / (stockBefore + 20)) * 10000) / 10000;
const entry = await req<{ newStock: number; newAvgCost: number }>('/inventory/entries', token, {
  method: 'POST',
  body: JSON.stringify({ productId: carne.id, quantity: 20, unitCost: 25000, batchNumber: TEST_BATCH_FAR }),
});
check(
  'promedio ponderado correcto',
  Math.abs(entry.newAvgCost - expectedAvg) < 0.01,
  `esperado=${expectedAvg}, obtenido=${entry.newAvgCost}`,
);
check('stock actualizado', entry.newStock === stockBefore + 20, `${entry.newStock}`);

// Lote adicional que vence pronto, exactamente de la cantidad que se mermará
// abajo — así el FEFO se verifica sin depender de ningún lote preexistente.
const nearExpiry = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
await req('/inventory/entries', token, {
  method: 'POST',
  body: JSON.stringify({
    productId: carne.id,
    quantity: 5,
    unitCost: 25000,
    batchNumber: TEST_BATCH_NEAR,
    expiryDate: nearExpiry,
  }),
});

// --- 2. Cascada: la receta que usa carne debe recalcular su costo ---
const recipeAfter = await req<Recipe>(`/recipes/${almuerzo.id}`, token);
check(
  'receta recalculada en cascada',
  recipeAfter.costPerPortion > costBefore,
  `${costBefore} → ${recipeAfter.costPerPortion}`,
);

// --- 3. Merma 5 kg → FEFO consume primero el lote que vence (TEST_BATCH_NEAR) ---
type Detail = Product & { batches: { batchNumber: string; remainingQuantity: number; expiryDate: string | null }[] };
await req('/inventory/adjustments', token, {
  method: 'POST',
  body: JSON.stringify({ productId: carne.id, type: 'WASTE', quantity: 5, reason: 'Prueba E2E de merma FEFO' }),
});
const after = await req<Detail>(`/products/${carne.id}`, token);
const nearBatch = after.batches.find((b) => b.batchNumber === TEST_BATCH_NEAR);
const farBatch = after.batches.find((b) => b.batchNumber === TEST_BATCH_FAR)!;
check(
  'FEFO consumió primero el lote que vence',
  // remainingQuantity=0 hace que el lote no aparezca en el detalle (solo se listan con stock > 0)
  !nearBatch && farBatch.remainingQuantity === 20,
  `${TEST_BATCH_NEAR} agotado=${!nearBatch}, ${TEST_BATCH_FAR} intacto=${farBatch.remainingQuantity}`,
);

// --- 4. Stock insuficiente → bloqueado ---
try {
  await req('/inventory/adjustments', token, {
    method: 'POST',
    body: JSON.stringify({ productId: carne.id, type: 'LOSS', quantity: 99999, reason: 'Debe fallar' }),
  });
  check('stock insuficiente rechazado', false);
} catch (e) {
  check('stock insuficiente rechazado (INSUFFICIENT_STOCK)', (e as { code?: string }).code === 'INSUFFICIENT_STOCK');
}

// --- 5. Kardex registra los movimientos con saldo ---
type Movement = { type: string; balanceAfter: number };
const movements = await req<Paginated<Movement>>(`/products/${carne.id}/movements`, token);
check(
  'kardex con ENTRY y WASTE',
  movements.items.some((m) => m.type === 'ENTRY') && movements.items.some((m) => m.type === 'WASTE'),
  `${movements.total} movimientos`,
);

// --- 6. Crear receta nueva y luego revisarla (versionado) ---
const units = await req<{ id: string; abbreviation: string }[]>('/catalog/units', token);
const kg = units.find((u) => u.abbreviation === 'kg')!;
const cats = await req<{ id: string; name: string }[]>('/catalog/categories?kind=RECIPE', token);
const nueva = await req<{ id: string; currentVersionNumber: number; costPerPortion: number }>('/recipes', token, {
  method: 'POST',
  body: JSON.stringify({
    name: `Receta Prueba 9A ${Date.now()}`, // nombre único: la prueba es re-ejecutable
    categoryId: cats[0]!.id,
    yieldPortions: 5,
    prepTimeMinutes: 30,
    targetMarginPct: 60,
    ingredients: [{ productId: carne.id, quantity: 1, unitId: kg.id }],
    steps: ['Paso único de prueba'],
  }),
});
check('receta creada con costo calculado', nueva.costPerPortion > 0, `costo/porción=${nueva.costPerPortion}`);

const revised = await req<{ currentVersionNumber: number }>(`/recipes/${nueva.id}/revise`, token, {
  method: 'POST',
  body: JSON.stringify({
    ingredients: [{ productId: carne.id, quantity: 2, unitId: kg.id }],
    steps: ['Paso único de prueba', 'Segundo paso'],
  }),
});
check('revisión crea versión 2', revised.currentVersionNumber === 2);

// limpieza: desactivar la receta de prueba (soft delete)
await req(`/recipes/${nueva.id}/deactivate`, token, { method: 'POST' });

// --- 7. Permisos: bodega no puede crear productos ---
const loginB = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'bodega', password: 'Gaby2026*' }),
});
const tokenB = ((await loginB.json()) as { data: { accessToken: string } }).data.accessToken;
try {
  await req('/products', tokenB, {
    method: 'POST',
    body: JSON.stringify({ code: 'X-1', name: 'No debe crearse', categoryId: 'x', unitId: 'x' }),
  });
  check('bodega bloqueada al crear producto', false);
} catch (e) {
  check('bodega bloqueada al crear producto (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
