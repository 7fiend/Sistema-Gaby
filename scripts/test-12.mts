/**
 * Prueba E2E de la Fase 12: Reportes.
 * Verifica: agregaciones por rango de fechas (ventas, producción, gastos,
 * utilidad, top recetas/ingredientes, rentabilidad, desperdicios), la foto
 * de inventario valorizado, export a PDF/XLSX/CSV (archivo real + fila en
 * `reports`), historial paginado, descarga, y permisos (cocina/bodega sin
 * acceso; auditor solo lee, no genera/exporta).
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

/** Para endpoints que responden un archivo binario, no el envelope {data}. */
async function reqBinary(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<{ status: number; contentType: string | null; length: number }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const buf = await res.arrayBuffer();
  return { status: res.status, contentType: res.headers.get('Content-Type'), length: buf.byteLength };
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
type Recipe = { id: string; name: string; yieldPortions: number; suggestedPrice: number };
type Product = { id: string; code: string; name: string; currentStock: number; avgCost: number };
type Order = { id: string; orderNumber: string; status: string; requirements: { id: string; productId: string; productName: string; requiredQuantity: number; deliveredQuantity: number }[] };
type ReportColumn = { key: string; header: string };
type ReportResult = { type: string; from: string; to: string; title: string; notes?: string; columns: ReportColumn[]; rows: Record<string, string | number>[]; summary?: Record<string, string | number> };
type ReportRecord = { id: string; type: string; format: string; createdBy: string; createdAt: string };

// --- Día sintético único (pasado) para que este run no choque con otras pruebas ---
const offsetDays = 1500 + (Date.now() % 6000);
const day = new Date(Date.now() - offsetDays * 24 * 3600 * 1000).toISOString().slice(0, 10);

const recipes = await req<Paginated<Recipe>>('/recipes?search=Almuerzo+Ejecutivo', token);
const almuerzo = recipes.items.find((r) => r.name === 'Almuerzo Ejecutivo')!;
check('receta Almuerzo Ejecutivo encontrada', !!almuerzo);

// --- 1. Venta única en el día sintético ---
const SALE_PORTIONS = 7;
const SALE_PRICE = 21000;
const sale = await req<{ id: string; totalAmount: number }>('/sales', token, {
  method: 'POST',
  body: JSON.stringify({
    date: day,
    items: [{ recipeId: almuerzo.id, portions: SALE_PORTIONS, unitPrice: SALE_PRICE }],
  }),
});
check('venta registrada en el día sintético', sale.totalAmount === SALE_PORTIONS * SALE_PRICE);

// --- 2. Gasto único en el día sintético ---
const cats = await req<{ id: string; name: string }[]>('/catalog/categories?kind=EXPENSE', token);
const EXPENSE_AMOUNT = 63000;
await req('/expenses', token, {
  method: 'POST',
  body: JSON.stringify({ categoryId: cats[0]!.id, amount: EXPENSE_AMOUNT, date: day, description: 'Gasto de prueba E2E 12' }),
});

// --- 3. Orden de producción confirmada en el día sintético, con una entrega parcial (para "waste") ---
const TEST_BATCH = `TEST-12-${Date.now()}`;
const almuerzoDetail = await req<Recipe & { ingredients: { productId: string; quantity: number }[] }>(`/recipes/${almuerzo.id}`, token);
const PORTIONS = 3;
const scale = PORTIONS / almuerzo.yieldPortions;
for (const ing of almuerzoDetail.ingredients) {
  const product = await req<Product>(`/products/${ing.productId}`, token);
  const needed = Math.ceil(ing.quantity * scale + 5);
  await req('/inventory/entries', token, {
    method: 'POST',
    body: JSON.stringify({ productId: ing.productId, quantity: needed, unitCost: 1, batchNumber: `${TEST_BATCH}-${product.code}` }),
  });
}
const draft = await req<Order>('/production', token, {
  method: 'POST',
  body: JSON.stringify({ date: day, notes: 'Orden de prueba E2E 12', items: [{ recipeId: almuerzo.id, portions: PORTIONS }] }),
});
const { order: confirmed } = await req<{ order: Order }>(`/production/${draft.id}/confirm`, token, { method: 'POST' });
check('orden de producción confirmada en el día sintético', confirmed.status === 'CONFIRMED');

// Entrega PARCIAL del primer insumo (deja variación requerido vs entregado para "waste")
const firstReq = confirmed.requirements[0]!;
const partialQty = Math.round((firstReq.requiredQuantity / 2) * 1000) / 1000;
await req(`/production/${draft.id}/requirements/${firstReq.id}/deliveries`, token, {
  method: 'POST',
  body: JSON.stringify({ quantity: partialQty, mode: 'partial', source: 'SIMULATOR', readings: [] }),
});

// --- 4. Reportes por rango (día sintético, from=to=day) ---
const range = `from=${day}&to=${day}`;

const salesReport = await req<ReportResult>(`/reports/sales?${range}`, token);
const saleRow = salesReport.rows.find((r) => r.name === almuerzo.name);
check('reporte de ventas incluye la venta de prueba', !!saleRow && saleRow.total === SALE_PORTIONS * SALE_PRICE, JSON.stringify(saleRow));

const topRecipesReport = await req<ReportResult>(`/reports/top_recipes?${range}`, token);
check('top_recipes incluye la receta de prueba', topRecipesReport.rows.some((r) => r.name === almuerzo.name));

const topIngredientsReport = await req<ReportResult>(`/reports/top_ingredients?${range}`, token);
check('top_ingredients tiene filas para el día sintético', topIngredientsReport.rows.length > 0);

const productionReport = await req<ReportResult>(`/reports/production?${range}`, token);
check(
  'reporte de producción incluye la orden de prueba',
  productionReport.rows.some((r) => r.orderNumber === confirmed.orderNumber && r.portions === PORTIONS),
);

const expensesReport = await req<ReportResult>(`/reports/expenses?${range}`, token);
const catRow = expensesReport.rows.find((r) => r.categoryName === cats[0]!.name);
check('reporte de gastos incluye el gasto de prueba', !!catRow && (catRow.totalAmount as number) >= EXPENSE_AMOUNT);

const profitReport = await req<ReportResult>(`/reports/profit?${range}`, token);
const profitDay = profitReport.rows.find((r) => r.date === day);
check('reporte de utilidad incluye el día sintético', !!profitDay, JSON.stringify(profitDay));

const profitabilityReport = await req<ReportResult>(`/reports/recipe_profitability?${range}`, token);
const profRow = profitabilityReport.rows.find((r) => r.recipeName === almuerzo.name);
check('rentabilidad por receta incluye ventas y costo', !!profRow && (profRow.salesTotal as number) === SALE_PORTIONS * SALE_PRICE);

const wasteReport = await req<ReportResult>(`/reports/waste?${range}`, token);
const wasteRow = wasteReport.rows.find((r) => r.source === 'Producción' && r.productName === firstReq.productName);
check(
  'reporte de mermas refleja el requerido vs entregado de la entrega parcial',
  !!wasteRow && Math.abs((wasteRow.deliveredQuantity as number) - partialQty) < 0.01,
  JSON.stringify(wasteRow),
);

// --- 5. Inventario valorizado (foto actual, sin depender del rango) ---
const carneList = await req<Paginated<Product>>('/products?search=Carne+de+res', token);
const carneProduct = carneList.items.find((p) => p.code === 'CAR-001')!;
const inventoryReport = await req<ReportResult>('/reports/inventory_value?from=2020-01-01&to=2020-01-01', token);
check('inventory_value trae un aviso de que el rango no aplica', !!inventoryReport.notes);
const carneRow = inventoryReport.rows.find((r) => r.code === 'CAR-001');
const expectedValue = Math.round(carneProduct.currentStock * carneProduct.avgCost * 100) / 100;
check(
  'inventory_value refleja stock actual × costo promedio',
  !!carneRow && Math.abs((carneRow.totalValue as number) - expectedValue) < 1,
  `esperado=${expectedValue}, obtenido=${carneRow?.totalValue}`,
);

// --- 6. Merma de inventario (movimiento WASTE) — prueba por delta, robusta a otras corridas ---
const today = new Date().toISOString().slice(0, 10);
const beforeWaste = await req<ReportResult>(`/reports/waste?from=${today}&to=${today}`, token);
const beforeVal = (beforeWaste.rows.find((r) => r.source === 'Inventario' && r.productName === carneProduct.name)?.movementValue as number) ?? 0;
await req('/inventory/adjustments', token, {
  method: 'POST',
  body: JSON.stringify({ productId: carneProduct.id, type: 'WASTE', quantity: 1, reason: 'Prueba E2E 12' }),
});
const afterWaste = await req<ReportResult>(`/reports/waste?from=${today}&to=${today}`, token);
const afterVal = (afterWaste.rows.find((r) => r.source === 'Inventario' && r.productName === carneProduct.name)?.movementValue as number) ?? 0;
check('movimiento WASTE sube el valor de mermas de inventario', afterVal > beforeVal, `${beforeVal} → ${afterVal}`);

// --- 7. Export a los 3 formatos + historial + descarga ---
const CONTENT_TYPES: Record<string, string> = {
  CSV: 'text/csv',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF: 'application/pdf',
};
for (const format of ['CSV', 'XLSX', 'PDF'] as const) {
  const res = await reqBinary(`/reports/sales/export`, token, {
    method: 'POST',
    body: JSON.stringify({ from: day, to: day, format }),
  });
  check(`export ${format} responde archivo no vacío`, res.status === 200 && res.length > 0, `${res.length} bytes`);
  check(`export ${format} content-type correcto`, (res.contentType ?? '').includes(CONTENT_TYPES[format]!));
}

const history = await req<Paginated<ReportRecord>>('/reports?page=1', token);
check('historial de reportes no está vacío', history.items.length > 0);
const lastReportId = history.items[0]!.id;

const download = await reqBinary(`/reports/${lastReportId}/download`, token);
check('descarga de un reporte del historial funciona', download.status === 200 && download.length > 0);

// --- 8. Permisos ---
const tokenCocina = await login('cocina');
try {
  await req(`/reports/sales?${range}`, tokenCocina);
  check('cocina bloqueada al generar reportes', false);
} catch (e) {
  check('cocina bloqueada al generar reportes (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

const tokenBodega = await login('bodega');
try {
  await req('/reports', tokenBodega);
  check('bodega bloqueada al ver el historial', false);
} catch (e) {
  check('bodega bloqueada al ver el historial (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

const tokenAuditor = await login('auditor');
const historyAsAuditor = await req<Paginated<ReportRecord>>('/reports?page=1', tokenAuditor);
check('auditor puede ver el historial (reports:read)', Array.isArray(historyAsAuditor.items));
try {
  await req(`/reports/sales?${range}`, tokenAuditor);
  check('auditor bloqueado al generar reportes', false);
} catch (e) {
  check('auditor bloqueado al generar reportes (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}
try {
  await req(`/reports/sales/export`, tokenAuditor, { method: 'POST', body: JSON.stringify({ from: day, to: day, format: 'CSV' }) });
  check('auditor bloqueado al exportar reportes', false);
} catch (e) {
  check('auditor bloqueado al exportar reportes (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
