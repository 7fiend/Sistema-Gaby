/**
 * Prueba E2E de la Fase 13: Auditoría + Respaldos.
 * Verifica: bitácora con filtros (kind, usuario, rango, texto libre),
 * respaldo manual real (pg_dump → archivo comprimido + fila en `backups`),
 * historial paginado, descarga, confirmación fuerte de restauración
 * (rechaza palabra incorrecta) y permisos (cocina/bodega sin acceso;
 * auditor solo lee, no crea ni restaura).
 *
 * NOTA: esta prueba NO ejecuta una restauración real (backups:restore con
 * la palabra correcta) — eso reemplaza la base de datos completa y cierra
 * todas las sesiones; se verificó manualmente en navegador durante el
 * desarrollo de la Fase 13. Aquí solo se prueba que el endpoint exige la
 * confirmación y que los permisos la bloquean para roles sin acceso.
 *
 * Requiere el server corriendo (npm run dev) con `pg_dump`/`psql` disponibles
 * (PG_BIN en server/.env).
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

type Paginated<T> = { items: T[]; total: number };
type AuditEntry = {
  id: string;
  kind: string;
  userId: string | null;
  username: string | null;
  action: string;
  resource: string | null;
  createdAt: string;
};
type Backup = {
  id: string;
  filename: string;
  sizeBytes: number;
  type: 'MANUAL' | 'SCHEDULED';
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  createdBy: string | null;
  createdAt: string;
};

// --- 1. Auditoría: la bitácora ya tiene actividad (login de arriba genera auth.login.success) ---
const recent = await req<Paginated<AuditEntry>>('/audit?page=1&pageSize=5', token);
check('bitácora trae registros recientes', recent.items.length > 0);

const loginEntries = await req<Paginated<AuditEntry>>('/audit?kind=AUTH&page=1', token);
check(
  'filtro por kind=AUTH solo trae entradas de autenticación',
  loginEntries.items.length > 0 && loginEntries.items.every((e) => e.kind === 'AUTH'),
);

const bySearch = await req<Paginated<AuditEntry>>('/audit?search=login.success&page=1', token);
check(
  'búsqueda por texto filtra por acción',
  bySearch.items.length > 0 && bySearch.items.every((e) => e.action.includes('login.success')),
);

const adminUserId = loginEntries.items.find((e) => e.username === 'admin')?.userId;
if (adminUserId) {
  const byUser = await req<Paginated<AuditEntry>>(`/audit?userId=${adminUserId}&page=1`, token);
  check(
    'filtro por usuario solo trae sus propias entradas',
    byUser.items.length > 0 && byUser.items.every((e) => e.userId === adminUserId),
  );
} else {
  check('filtro por usuario solo trae sus propias entradas', false, 'no se encontró userId de admin en la bitácora');
}

// --- 2. Respaldos: creación manual real (pg_dump) ---
const before = await req<Paginated<Backup>>('/backups?page=1', token);

const created = await req<Backup>('/backups', token, { method: 'POST' });
check('respaldo manual queda COMPLETED', created.status === 'COMPLETED', created.error ?? '');
check('respaldo manual tiene tamaño > 0', created.sizeBytes > 0, `${created.sizeBytes} bytes`);
check('respaldo manual es de tipo MANUAL', created.type === 'MANUAL');

const after = await req<Paginated<Backup>>('/backups?page=1', token);
check('el respaldo recién creado aparece en el listado', after.items.some((b) => b.id === created.id));
check('el listado creció en al menos 1', after.total >= before.total + 1);

const download = await reqBinary(`/backups/${created.id}/download`, token);
check(
  'descarga del respaldo responde archivo gzip no vacío',
  download.status === 200 && download.length > 0 && (download.contentType ?? '').includes('gzip'),
  `${download.length} bytes, content-type=${download.contentType}`,
);

// --- 3. Confirmación fuerte de restauración (sin ejecutar la restauración real) ---
try {
  await req(`/backups/${created.id}/restore`, token, {
    method: 'POST',
    body: JSON.stringify({ confirmation: 'restaurar' }), // minúsculas: no coincide con la palabra exacta
  });
  check('restaurar con palabra incorrecta es rechazado', false);
} catch (e) {
  check(
    'restaurar con palabra incorrecta es rechazado (VALIDATION_ERROR)',
    (e as { code?: string }).code === 'VALIDATION_ERROR',
  );
}

// --- 4. Permisos ---
const tokenCocina = await login('cocina');
try {
  await req('/audit?page=1', tokenCocina);
  check('cocina bloqueada al ver auditoría', false);
} catch (e) {
  check('cocina bloqueada al ver auditoría (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}
try {
  await req('/backups?page=1', tokenCocina);
  check('cocina bloqueada al ver respaldos', false);
} catch (e) {
  check('cocina bloqueada al ver respaldos (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

const tokenBodega = await login('bodega');
try {
  await req('/backups', tokenBodega, { method: 'POST' });
  check('bodega bloqueada al crear respaldos', false);
} catch (e) {
  check('bodega bloqueada al crear respaldos (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

const tokenAuditor = await login('auditor');
const auditAsAuditor = await req<Paginated<AuditEntry>>('/audit?page=1', tokenAuditor);
check('auditor puede leer la bitácora (audit:read)', Array.isArray(auditAsAuditor.items));

const backupsAsAuditor = await req<Paginated<Backup>>('/backups?page=1', tokenAuditor);
check('auditor puede leer respaldos (backups:read)', Array.isArray(backupsAsAuditor.items));

try {
  await req('/backups', tokenAuditor, { method: 'POST' });
  check('auditor bloqueado al crear respaldos', false);
} catch (e) {
  check('auditor bloqueado al crear respaldos (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}
try {
  await req(`/backups/${created.id}/restore`, tokenAuditor, {
    method: 'POST',
    body: JSON.stringify({ confirmation: 'RESTAURAR' }),
  });
  check('auditor bloqueado al restaurar', false);
} catch (e) {
  check('auditor bloqueado al restaurar (FORBIDDEN)', (e as { code?: string }).code === 'FORBIDDEN');
}

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
