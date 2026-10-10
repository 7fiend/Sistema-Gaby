/**
 * Prueba E2E de la Fase 19: Horarios de empleadas.
 * Verifica: CRUD de empleadas, generación del horario de un mes con las
 * invariantes acordadas (cada día descansa exactamente una auxiliar, sin
 * avisos de cobertura), avisos al editar una celda, cocina a mano que
 * sobrevive a "Regenerar", fecha fuera del mes rechazada, publicar →
 * regenerar bloqueado (409) pero editar permitido y auditado con antes/después,
 * export a Excel y permisos (bodega sin acceso; auditor solo lee).
 *
 * Re-ejecutable sin ensuciar los meses reales: cada corrida usa un mes de un
 * año lejano al azar (deja ese horario como residuo de prueba, igual que las
 * demás suites) y sus empleadas TEST-19 se desactivan al final. Las filas
 * exactas del horario de octubre 2026 las cubre la prueba unitaria
 * server/src/domain/services/shiftSchedule.test.ts.
 *
 * Requiere el server corriendo (npm run dev).
 */
const BASE = 'http://localhost:3000/api/v1';
let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
};

interface Employee { id: string; fullName: string; group: 'KITCHEN' | 'AUXILIARY'; isActive: boolean }
interface View {
  schedule: { id: string; status: string; assignments: { employeeId: string; day: number; code: string }[] } | null;
  employees: Employee[];
  warnings: { day: number; message: string }[];
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const isJson = res.headers.get('content-type')?.includes('json');
  const json = isJson ? ((await res.json()) as { data?: unknown }) : null;
  return { status: res.status, headers: res.headers, data: json?.data as any };
}

async function login(username: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Gaby2026*' }),
  });
  return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
}

const admin = await login('admin');
const tag = `TEST-19-${Date.now()}`;

// --- Equipo de prueba: si no hay auxiliares activas, se crea uno propio ---
const created: string[] = [];
let active = (await call(admin, 'GET', '/employees')).data as Employee[];
if (!active.some((e) => e.group === 'AUXILIARY')) {
  const team = [
    { fullName: `${tag} Aux A`, group: 'AUXILIARY', displayOrder: 901 },
    { fullName: `${tag} Aux B`, group: 'AUXILIARY', displayOrder: 902 },
    { fullName: `${tag} Aux C`, group: 'AUXILIARY', displayOrder: 903 },
    { fullName: `${tag} Admin`, group: 'AUXILIARY', displayOrder: 904, fixedShift: 'M', fixedWeekendRest: true },
  ];
  for (const e of team) created.push((await call(admin, 'POST', '/employees', e)).data.id);
}
// Una empleada de cocina propia para probar el llenado a mano
const kitchen = await call(admin, 'POST', '/employees', { fullName: `${tag} Cocina`, group: 'KITCHEN', displayOrder: 999 });
check('crear empleada de cocina', kitchen.status === 201);
created.push(kitchen.data.id);
const renamed = await call(admin, 'PUT', `/employees/${kitchen.data.id}`, { fullName: `${tag} Cocina (editada)` });
check('editar empleada', renamed.status === 200 && renamed.data.fullName.endsWith('(editada)'));

// --- Mes sintético lejano (sin horario aún) para no tocar meses reales ---
// El schema admite años hasta 2100: se busca un mes libre entre 2090 y 2100.
let year = 0;
let month = 0;
for (let attempt = 0; attempt < 200 && !year; attempt++) {
  const y = 2090 + Math.floor(Math.random() * 11);
  const m = 1 + Math.floor(Math.random() * 12);
  if ((await call(admin, 'GET', `/schedules?year=${y}&month=${m}`)).data?.schedule === null) [year, month] = [y, m];
}
if (!year) {
  console.log('FAIL  no queda un mes libre entre 2090 y 2100 para la prueba (limpiar horarios de prueba)');
  process.exit(1);
}
const gen = await call(admin, 'POST', '/schedules/generate', { year, month });
check(`generar horario ${year}-${month}`, gen.status === 201 && gen.data.schedule?.status === 'DRAFT');
let view = gen.data as View;
const sid = view.schedule!.id;
const auxiliaries = view.employees.filter((e) => e.group === 'AUXILIARY');
const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
const codeOf = (v: View, id: string, day: number) =>
  v.schedule!.assignments.find((a) => a.employeeId === id && a.day === day)?.code;

const everyDayOneRest = Array.from({ length: totalDays }, (_, i) => i + 1).every(
  (day) => auxiliaries.filter((e) => codeOf(view, e.id, day) === 'D').length === 1,
);
check('cada día descansa exactamente una auxiliar', everyDayOneRest);
check('sin avisos de cobertura', view.warnings.length === 0, `${view.warnings.length} avisos`);
check('cocina queda vacía (se llena a mano)', !view.schedule!.assignments.some((a) => a.employeeId === kitchen.data.id));

// --- Editar una celda: dos descansando el mismo día → aviso ---
const day = 15;
const worker = auxiliaries.find((e) => codeOf(view, e.id, day) !== 'D')!;
const original = codeOf(view, worker.id, day)!;
const iso = `${year}-${String(month).padStart(2, '0')}-${day}`;
await call(admin, 'PUT', `/schedules/${sid}/assignments`, { employeeId: worker.id, date: iso, code: 'D' });
view = (await call(admin, 'GET', `/schedules?year=${year}&month=${month}`)).data;
check(
  'editar una celda genera el aviso de cobertura',
  view.warnings.some((w) => w.day === day && w.message.includes('Descansan 2 auxiliares')),
);
await call(admin, 'PUT', `/schedules/${sid}/assignments`, { employeeId: worker.id, date: iso, code: original });

const wrongMonth = month === 12 ? `${year + 1}-01-05` : `${year}-${String(month + 1).padStart(2, '0')}-05`;
const outside = await call(admin, 'PUT', `/schedules/${sid}/assignments`, { employeeId: worker.id, date: wrongMonth, code: 'D' });
check('fecha de otro mes rechazada', outside.status === 400, `${outside.status}`);

// --- Cocina a mano + Regenerar la conserva ---
await call(admin, 'PUT', `/schedules/${sid}/assignments`, { employeeId: kitchen.data.id, date: `${year}-${String(month).padStart(2, '0')}-01`, code: 'M' });
await call(admin, 'POST', '/schedules/generate', { year, month });
view = (await call(admin, 'GET', `/schedules?year=${year}&month=${month}`)).data;
check('regenerar conserva lo llenado a mano en cocina', codeOf(view, kitchen.data.id, 1) === 'M');

// --- Publicar: regenerar bloqueado, editar permitido y auditado ---
const pub = await call(admin, 'POST', `/schedules/${sid}/publish`);
check('publicar', pub.status === 200 && pub.data.status === 'PUBLISHED');
const regen = await call(admin, 'POST', '/schedules/generate', { year, month });
check('regenerar un horario publicado se rechaza', regen.status === 409, `${regen.status}`);
const after = await call(admin, 'PUT', `/schedules/${sid}/assignments`, { employeeId: kitchen.data.id, date: `${year}-${String(month).padStart(2, '0')}-01`, code: 'T' });
check('editar con el horario publicado se permite', after.status === 200);
const audit = (await call(admin, 'GET', `/audit?search=schedule.assignment-update&pageSize=10`)).data;
const entry = audit.items.find(
  (a: { action: string; resourceId: string }) => a.action === 'schedule.assignment-update' && a.resourceId === sid,
);
check('auditoría guarda antes/después del cambio', entry?.before?.code === 'M' && entry?.after?.code === 'T');

// --- Export ---
const exp = await fetch(`${BASE}/schedules/export?year=${year}&month=${month}`, { headers: { Authorization: `Bearer ${admin}` } });
const size = (await exp.arrayBuffer()).byteLength;
check(
  'exportar Excel',
  exp.status === 200 && (exp.headers.get('content-disposition') ?? '').includes('.xlsx') && size > 1000,
  `${exp.status}, ${size} bytes`,
);

// --- Permisos ---
const bodega = await login('bodega');
check('bodega no puede ver horarios', (await call(bodega, 'GET', `/schedules?year=${year}&month=${month}`)).status === 403);
const auditor = await login('auditor');
check('auditor puede ver horarios', (await call(auditor, 'GET', `/schedules?year=${year}&month=${month}`)).status === 200);
check(
  'auditor no puede editar',
  (await call(auditor, 'PUT', `/schedules/${sid}/assignments`, { employeeId: worker.id, date: iso, code: 'T' })).status === 403,
);
check('auditor no puede crear empleadas', (await call(auditor, 'POST', '/employees', { fullName: 'X', group: 'KITCHEN' })).status === 403);

// --- Limpieza: desactivar las empleadas de prueba ---
for (const id of created) await call(admin, 'POST', `/employees/${id}/deactivate`);
active = (await call(admin, 'GET', '/employees')).data as Employee[];
check('empleadas de prueba desactivadas (no aparecen en meses reales)', !active.some((e) => e.fullName.startsWith(tag)));

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exitCode = fail > 0 ? 1 : 0;
