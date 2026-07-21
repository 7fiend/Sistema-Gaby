/**
 * Prueba E2E de la Fase 10: entregas por báscula (módulo Bodega).
 * Verifica: regla de tolerancia simétrica (completa/parcial), máquina de
 * estados de requirements y de la orden (CONFIRMED→IN_DELIVERY→DELIVERED),
 * consumo FEFO real, alerta `delivery_blocked`, conteo para productos no
 * pesables, guardas de negocio y permisos.
 * Requiere el server corriendo (npm run dev) y el seed actualizado
 * (INVENTORY ahora incluye production:read).
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
type Product = { id: string; code: string; currentStock: number; unit: { abbreviation: string } };
type Recipe = { id: string; name: string; yieldPortions: number };
type Requirement = {
  id: string;
  productId: string;
  productName: string;
  isWeighable: boolean;
  requiredQuantity: number;
  deliveredQuantity: number;
  status: string;
  toleranceApplied: number;
};
type Order = { id: string; orderNumber: string; status: string; requirements: Requirement[] };
type DeliveryResult = {
  order: Order;
  delivery: { id: string; quantity: number; source: string; approved: boolean; withinTolerance: boolean };
  approved: boolean;
  withinTolerance: boolean;
  deltaKg: number;
};

// --- Datos base ---
const recipes = await req<Paginated<Recipe>>('/recipes?search=Almuerzo+Ejecutivo', token);
const almuerzo = recipes.items.find((r) => r.name === 'Almuerzo Ejecutivo')!;
check('receta Almuerzo Ejecutivo encontrada', !!almuerzo);

// Stock de sobra para no depender de lo que dejaron otras pruebas E2E.
const TEST_BATCH = `TEST-10-${Date.now()}`;
for (const code of ['CAR-001', 'GRA-001', 'EMP-001']) {
  const found = await req<Paginated<Product>>(`/products?search=${code}`, token);
  const product = found.items.find((p) => p.code === code)!;
  await req('/inventory/entries', token, {
    method: 'POST',
    body: JSON.stringify({
      productId: product.id,
      quantity: 50,
      unitCost: 1,
      batchNumber: `${TEST_BATCH}-${code}`,
    }),
  });
}

// --- 1. Crear y confirmar una orden pequeña (4 porciones → CAR-001 requerido = 1.000 kg) ---
const today = new Date().toISOString().slice(0, 10);
const draft = await req<Order>('/production', token, {
  method: 'POST',
  body: JSON.stringify({
    date: today,
    notes: 'Orden de prueba E2E 10',
    items: [{ recipeId: almuerzo.id, portions: 4 }],
  }),
});
const { order: confirmed } = await req<{ order: Order }>(`/production/${draft.id}/confirm`, token, {
  method: 'POST',
});
check('orden confirmada', confirmed.status === 'CONFIRMED', confirmed.orderNumber);

const reqOf = (order: Order, code: string) => order.requirements.find((r) => r.productName.includes(codeToName[code]))!;
const codeToName: Record<string, string> = {
  'CAR-001': 'Carne de res',
  'GRA-001': 'Arroz',
  'EMP-001': 'Bandeja desechable',
};
const carneReq = reqOf(confirmed, 'CAR-001');
const arrozReq = reqOf(confirmed, 'GRA-001');
const bandejaReq = reqOf(confirmed, 'EMP-001');
check('CAR-001 requerido = 1.000 kg', Math.abs(carneReq.requiredQuantity - 1.0) < 0.001, `${carneReq.requiredQuantity}`);
check('GRA-001 requerido = 0.800 kg', Math.abs(arrozReq.requiredQuantity - 0.8) < 0.001, `${arrozReq.requiredQuantity}`);
check('EMP-001 no pesable', bandejaReq.isWeighable === false);
check('EMP-001 requerido = 4 und', bandejaReq.requiredQuantity === 4, `${bandejaReq.requiredQuantity}`);

const deliver = (orderId: string, reqId: string, body: unknown, tok = token) =>
  req<DeliveryResult>(`/production/${orderId}/requirements/${reqId}/deliveries`, tok, {
    method: 'POST',
    body: JSON.stringify(body),
  });

// --- 2. Entrega completa dentro de tolerancia (±0.05 kg) ---
const stockBefore = (
  await req<Product>(`/products/${carneReq.productId}`, token)
).currentStock;
const r1 = await deliver(draft.id, carneReq.id, { quantity: 1.02, mode: 'complete', source: 'SIMULATOR', readings: [] });
check('entrega dentro de tolerancia aprobada', r1.approved === true && r1.withinTolerance === true);
check('orden pasa a IN_DELIVERY con la primera entrega', r1.order.status === 'IN_DELIVERY', r1.order.status);
const carneAfter1 = r1.order.requirements.find((r) => r.id === carneReq.id)!;
check('requirement CAR-001 queda DELIVERED', carneAfter1.status === 'DELIVERED', carneAfter1.status);
const stockAfter = (await req<Product>(`/products/${carneReq.productId}`, token)).currentStock;
check('stock decrementado exactamente lo entregado (FEFO)', Math.abs(stockBefore - stockAfter - 1.02) < 0.001, `${stockBefore} → ${stockAfter}`);

try {
  await deliver(draft.id, carneReq.id, { quantity: 0.01, mode: 'complete', source: 'SIMULATOR', readings: [] });
  check('reintentar sobre requirement ya entregado rechazado', false);
} catch (e) {
  check('reintentar sobre requirement ya entregado rechazado (CONFLICT)', (e as { code?: string }).code === 'CONFLICT');
}

// --- 3. Entrega completa fuera de tolerancia (bloqueada) ---
const stockArrozBefore = (await req<Product>(`/products/${arrozReq.productId}`, token)).currentStock;
const r2 = await deliver(draft.id, arrozReq.id, { quantity: 0.5, mode: 'complete', source: 'SIMULATOR', readings: [] });
check('entrega fuera de tolerancia bloqueada', r2.approved === false);
check('deltaKg negativo (faltan)', r2.deltaKg < 0, `${r2.deltaKg}`);
const arrozAfter2 = r2.order.requirements.find((r) => r.id === arrozReq.id)!;
check('requirement GRA-001 queda BLOCKED', arrozAfter2.status === 'BLOCKED', arrozAfter2.status);
check('deliveredQuantity sin cambios', arrozAfter2.deliveredQuantity === 0);
const stockArrozAfterBlock = (await req<Product>(`/products/${arrozReq.productId}`, token)).currentStock;
check('stock intacto tras el bloqueo', stockArrozAfterBlock === stockArrozBefore);

const alerts = await req<{ type: string; message: string }[]>('/alerts?limit=50', token);
check(
  'alerta delivery_blocked generada',
  alerts.some((a) => a.type === 'delivery_blocked' && a.message.includes('Arroz')),
);

// --- 4. Entrega parcial válida (sin chequear tolerancia) ---
const r3 = await deliver(draft.id, arrozReq.id, { quantity: 0.3, mode: 'partial', source: 'SIMULATOR', readings: [] });
check('entrega parcial dentro del pendiente aprobada', r3.approved === true);
const arrozAfter3 = r3.order.requirements.find((r) => r.id === arrozReq.id)!;
check('deliveredQuantity acumula', Math.abs(arrozAfter3.deliveredQuantity - 0.3) < 0.001, `${arrozAfter3.deliveredQuantity}`);
check('requirement queda PARTIAL (aún lejos de tolerancia)', arrozAfter3.status === 'PARTIAL', arrozAfter3.status);

// --- 5. Entrega parcial que excede el pendiente (bloqueada igual) ---
const r4 = await deliver(draft.id, arrozReq.id, { quantity: 0.6, mode: 'partial', source: 'SIMULATOR', readings: [] });
check('parcial que excede el pendiente (0.5) es bloqueada', r4.approved === false);

// --- 6. Completar GRA-001 exactamente ---
const r5 = await deliver(draft.id, arrozReq.id, { quantity: 0.5, mode: 'complete', source: 'SIMULATOR', readings: [] });
check('GRA-001 completado exacto aprobado', r5.approved === true);
const arrozFinal = r5.order.requirements.find((r) => r.id === arrozReq.id)!;
check('GRA-001 queda DELIVERED', arrozFinal.status === 'DELIVERED', arrozFinal.status);

// --- 7. Conteo (isWeighable:false) ---
const r6 = await deliver(draft.id, bandejaReq.id, { quantity: 4, mode: 'complete', source: 'COUNT', readings: [] });
check('conteo exacto aprobado', r6.approved === true);
const bandejaFinal = r6.order.requirements.find((r) => r.id === bandejaReq.id)!;
check('EMP-001 queda DELIVERED', bandejaFinal.status === 'DELIVERED', bandejaFinal.status);

// --- 8. Completar el resto de insumos y verificar cierre de la orden ---
let last = r6.order;
for (const requirement of last.requirements) {
  if (requirement.status === 'DELIVERED') continue;
  const pending = requirement.requiredQuantity - requirement.deliveredQuantity;
  const result = await deliver(draft.id, requirement.id, {
    quantity: Math.round(pending * 1000) / 1000,
    mode: 'complete',
    source: 'SIMULATOR',
    readings: [],
  });
  last = result.order;
}
check('todos los requirements quedaron DELIVERED', last.requirements.every((r) => r.status === 'DELIVERED'));
check('la orden transiciona a DELIVERED', last.status === 'DELIVERED', last.status);

// --- 9. Guardas de negocio ---
try {
  await deliver(draft.id, carneReq.id, { quantity: 0.01, mode: 'complete', source: 'SIMULATOR', readings: [] });
  check('entregar sobre una orden ya DELIVERED rechazado', false);
} catch (e) {
  check(
    'entregar sobre una orden ya DELIVERED rechazado (INVALID_TRANSITION)',
    (e as { code?: string }).code === 'INVALID_TRANSITION',
  );
}

try {
  await deliver(draft.id, 'requirement-inexistente', { quantity: 1, mode: 'complete', source: 'SIMULATOR', readings: [] });
  check('reqId inexistente rechazado', false);
} catch (e) {
  check('reqId inexistente rechazado (NOT_FOUND)', (e as { code?: string }).code === 'NOT_FOUND');
}

try {
  await deliver(draft.id, carneReq.id, { quantity: 0, mode: 'complete', source: 'SIMULATOR', readings: [] });
  check('cantidad cero rechazada', false);
} catch (e) {
  check('cantidad cero rechazada (VALIDATION_ERROR)', (e as { code?: string }).code === 'VALIDATION_ERROR');
}

// --- 10. Permisos ---
const draft2 = await req<Order>('/production', token, {
  method: 'POST',
  body: JSON.stringify({ date: today, items: [{ recipeId: almuerzo.id, portions: 1 }] }),
});
const { order: confirmed2 } = await req<{ order: Order }>(`/production/${draft2.id}/confirm`, token, {
  method: 'POST',
});
const carneReq2 = reqOf(confirmed2, 'CAR-001');

const tokenK = await login('cocina');
try {
  await deliver(draft2.id, carneReq2.id, { quantity: 0.25, mode: 'complete', source: 'SIMULATOR', readings: [] }, tokenK);
  check('cocina bloqueada al entregar', false);
} catch (e) {
  check('cocina bloqueada al entregar (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

const tokenB = await login('bodega');
const orderForBodega = await req<Order>(`/production/${draft2.id}`, tokenB);
check('bodega puede leer la orden (production:read)', orderForBodega.id === draft2.id);
const r7 = await deliver(draft2.id, carneReq2.id, { quantity: 0.25, mode: 'complete', source: 'SIMULATOR', readings: [] }, tokenB);
check('bodega puede registrar la entrega', r7.approved === true);

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
