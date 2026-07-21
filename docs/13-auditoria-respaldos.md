# Fase 13 — Auditoría (UI) + Respaldos
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-11 · **Estado:** Completada y verificada

---

## 1. Backend

### Auditoría (RF-13.1): solo lectura sobre el puerto de escritura ya existente
`IAuditLogger` (puerto de escritura, usado por todo caso de uso mutador desde la Fase 1) no
cambió. Se agregó el lado de lectura, simétrico al patrón de `reports`/`users`:
- `IAuditRepository` (dominio) → `PrismaAuditRepository` (infra): `list(query)` paginado con
  filtros `userId`, `kind`, rango `from`/`to` y texto libre (`search`, sobre `action`/`resource`,
  `contains` insensible a mayúsculas — mismo patrón que `PrismaUserRepository`/`PrismaExpenseRepository`).
- `AuditUseCases` (delgado, un solo método) → `AuditController` → `GET /audit` (permiso `audit:read`,
  ya existía en `shared/permissions` y en el seed desde fases anteriores; no hizo falta tocarlos).

### Respaldos (RF-13.2): `pg_dump`/`psql` reales, no simulados
- **`PgDumpBackupService`** (infra, sin puerto de dominio — misma decisión pragmática que
  `writeReportFile` en Fase 12): hace `spawn` de `pg_dump`/`psql` resueltos desde `PG_BIN` (o
  `PATH` si no está seteado) y transmite en streaming con `pipeline()` de Node.
  - **Conexión por flags (`-h -p -U -d`) + `PGPASSWORD`, nunca la `DATABASE_URL` cruda**: Prisma le
    agrega `?schema=public`, un parámetro que `pg_dump`/`psql` no reconocen como URI de conexión
    válida — se parsea con `new URL()` y se arma la conexión manualmente. Efecto secundario bueno:
    la contraseña nunca queda en el argv del proceso (visible en el listado de procesos).
  - **Dump en texto plano con `--clean --if-exists --no-owner --no-privileges`**, comprimido con
    `zlib.createGzip()` en streaming (no se materializa el SQL sin comprimir en disco). El
    `--clean --if-exists` es la decisión clave: agrega `DROP ... IF EXISTS` antes de cada
    `CREATE`, así el mismo archivo sirve para restaurar **sobre una base de datos que ya tiene
    datos**, sin un paso manual de "vaciar primero".
  - **Restauración**: `gunzip` en streaming directo al `stdin` de `psql -v ON_ERROR_STOP=1`.
- **`BackupUseCases`**: crea la fila (`RUNNING`) → corre el dump → `COMPLETED` (con `sizeBytes`) o
  `FAILED` (con el mensaje de error, nunca tumba la request) → audita → aplica retención
  (`backupRetentionCount` de Configuración, ya existía desde la Fase 9c — se leyó vía
  `SettingsUseCases.get()` inyectado, mismo patrón que `DeliveryUseCases` depende de
  `ProductionUseCases`). Retención borra archivo + fila de los respaldos `COMPLETED` más allá de
  los N más recientes.
- **`sizeBytes` es `number`, no `bigint`**: Prisma lo modela como `BigInt` (columna `Backup.sizeBytes`),
  pero `JSON.stringify`/`res.json()` no serializan `BigInt` — se convierte en el límite
  infra→dominio (`PrismaBackupRepository`). Nunca se acerca a `Number.MAX_SAFE_INTEGER` (± 9
  petabytes) para el tamaño de un dump de este restaurante.
- **`backups` NO es append-only** (a diferencia de `stock_movements`/`deliveries`/`audit_logs`/`reports`):
  necesita `UPDATE` (RUNNING→COMPLETED/FAILED) y `DELETE` (retención) — no tiene trigger de
  inmutabilidad en la BD (confirmado en las migraciones existentes) y no hizo falta agregar uno.
- **Restauración = confirmación fuerte real, validada en el servidor**: `backupRestoreSchema` en
  `@gaby/shared` usa `z.literal('RESTAURAR')` — el body tiene que traer exactamente esa palabra o
  Zod rechaza con `VALIDATION_ERROR` antes de tocar la base de datos. El permiso `backups:restore`
  se revisa ANTES de la validación del body (orden de middlewares en la ruta), así un usuario sin
  permiso nunca llega a intentar la palabra.
- **Qué se audita en la restauración**: solo `audit_logs` (`kind:'SYSTEM'`, `action:'backup.restore'`),
  no una fila nueva en `backups` — restaurar no es "crear un respaldo", y el modelo `BackupType`
  (`MANUAL`/`SCHEDULED`) no tiene un tercer valor para esto. El registro se escribe **después** de
  que `psql` termina, sobre la base ya restaurada (por eso sobrevive al propio restore).

### Cron de respaldos programados
`backup.schedule` (cron string) y `backup.retentionCount` ya existían como *settings* completos
desde la Fase 9c (schema Zod, UI en Configuración, defaults) — solo faltaba algo que los
consumiera. `startBackupCron()` (mismo estilo que `startExpiryCron` de la 9c) lee el horario **una
sola vez al arrancar** el servidor, a diferencia del cron de vencimientos:
- **No corre uno al arrancar.** El cron de vencimientos sí lo hace (el PC del restaurante puede
  estar apagado de madrugada), pero `tsx watch` reinicia el proceso en cada guardado durante
  desarrollo — un respaldo por cada cambio de archivo sería absurdo y lento.
- **Cambiar el horario en Configuración requiere reiniciar el servidor** para que aplique (se
  documenta así en vez de construir un mecanismo de re-programación en caliente — no lo pidió el
  cliente y añade complejidad para un cron que en un restaurante real casi nunca cambia).

### Endpoints
```
GET  /audit                    perm audit:read           → bitácora paginada con filtros

GET  /backups                  perm backups:read          → historial paginado
POST /backups                  perm backups:create         → respaldo manual (pg_dump real, síncrono)
GET  /backups/:id/download     perm backups:read           → archivo .sql.gz
POST /backups/:id/restore      perm backups:restore        → confirmación fuerte + psql real
```
Los permisos `audit:read` y `backups:read/create/restore`, y los modelos `AuditLog`/`Backup`, ya
existían desde las Fases 1–3 (preparación adelantada); `ADMIN` los hereda vía `() => true`,
`AUDITOR` obtiene los dos `:read` vía `a === 'read'` pero no `create`/`restore` — verificado en el
E2E. No hizo falta tocar `database/seed.ts` ni `schema.prisma`.

## 2. Frontend

- `client/src/lib/utils.ts`: `formatDateTime()` (fecha + hora, es-CO/América Bogotá — la bitácora
  necesita más precisión que `formatDate()` para distinguir eventos del mismo día) y
  `formatBytes()` (B/KB/MB/GB para el tamaño de los respaldos).
- `client/src/features/audit/AuditPage.tsx` (reemplaza el `PlaceholderPage`): `DataTable` con
  búsqueda de texto libre + filtros de tipo/usuario/rango en la barra de herramientas; clic en una
  fila abre un diálogo con el detalle completo y los bloques `Estado previo`/`Estado posterior`/
  `Metadatos` en JSON con formato (no se implementó un diff campo-a-campo — mostrar ambos estados
  completos ya cubre el caso de uso sin la complejidad de una librería de diffing).
- `client/src/features/backups/BackupsPage.tsx` (reemplaza el `PlaceholderPage`): botón "Respaldar
  ahora", tabla con estado/tamaño/tipo, descarga y restauración por fila. El diálogo de
  restauración usa un esquema Zod **local** (no `backupRestoreSchema` de `@gaby/shared`
  directamente): TypeScript 5.5+ infiere automáticamente un *type predicate* en
  `.refine((v) => v === RESTORE_CONFIRMATION_WORD)`, lo que filtra el tipo del campo a la literal
  `"RESTAURAR"` y rompe el `defaultValue` vacío del input de React Hook Form. La réplica local
  anota el retorno del refine como `boolean` explícito para evitarlo, pero valida contra la misma
  constante `RESTORE_CONFIRMATION_WORD` importada de `@gaby/shared` — el servidor revalida con el
  esquema real, así que no hay forma de que ambos lados diverjan en la palabra exigida.

## 3. Verificación (todo en ejecución real)

`scripts/test-13.mts` — **18/18 PASS** (server corriendo):

| Prueba | Resultado |
|---|---|
| Bitácora trae registros recientes; filtros por `kind`, texto libre y `userId` | ✅ |
| Respaldo manual real (`pg_dump`) queda `COMPLETED` con tamaño > 0 | ✅ |
| Respaldo aparece en el listado paginado | ✅ |
| Descarga responde el archivo `.sql.gz` real (content-type `application/gzip`) | ✅ |
| Restaurar con palabra incorrecta rechazado (`VALIDATION_ERROR`), sin tocar la BD | ✅ |
| Permisos: `cocina`/`bodega` bloqueados en auditoría y respaldos | ✅ |
| Permisos: `auditor` lee ambos módulos pero no crea ni restaura respaldos | ✅ |

`test-13.mts` **no ejecuta una restauración real** (palabra correcta) de forma automática/repetible
— reemplaza la base de datos completa y cierra todas las sesiones, así que no es apto para un
script que se re-ejecuta. Esa ruta se verificó a mano en navegador (ver abajo).

Regresión con el server corriendo: `test-9b.mts` **30/30**, `test-9c.mts` **36/36**, `test-10.mts`
**33/33**, `test-11.mts` **17/17**, `test-12.mts` **27/27**, `test-realtime.mts` **3/3**, `tsc
--noEmit` en los 3 workspaces ✅. `test-9a.mts` falló en la prueba de FEFO por un `LOTE-INICIAL`
ya agotado (el seed no repone la cantidad de un lote existente con `update: {}` a propósito, para
no deshacer consumo real de pruebas) — es acumulado por corridas de `test-9a` en sesiones
anteriores (2026-07-07 a la fecha), no una regresión de esta fase (confirmado inspeccionando los
lotes de `CAR-001` en vivo: `LOTE-INICIAL` no aparece porque su `remainingQuantity` es 0).

Navegador real (`admin`, `/admin/auditoria` y `/admin/respaldos`):
- Auditoría: bitácora real visible al cargar, filtro por tipo ("Seguridad") y por texto ("login")
  funcionando, diálogo de detalle abierto sobre un `report.export` mostrando su `Estado posterior`
  en JSON.
- Respaldos: **respaldo manual real creado** (68,8 KB, `pg_dump` real — contenido descargado e
  inspeccionado a mano: SQL válido con `DROP ... IF EXISTS`/`CREATE`, `\restrict`/`\unrestrict`
  pareados de `pg_dump`/`psql` 16.14). Diálogo de restauración: la palabra en minúsculas
  (`restaurar`) fue rechazada con el mensaje esperado sin llegar al servidor. **Restauración real
  ejecutada de punta a punta** (con confirmación explícita del cliente, ya que es una acción
  destructiva e irreversible): `psql` recreó las tablas desde el dump tomado segundos antes, el
  servidor siguió respondiendo (`/health` OK, Prisma reconectó sin reinicio), la sesión sobrevivió
  (el login era anterior al respaldo restaurado) y el evento `backup.restore` quedó en la bitácora
  **después** de la restauración, confirmando que se escribe sobre la base ya restaurada.

### Datos de prueba que quedan en la BD
Un respaldo `MANUAL` real por cada corrida de `test-13.mts` y de la verificación manual, con su
archivo `.sql.gz` en `BACKUPS_DIR` (`../backups` relativo a `server/`) — la retención
(`backupRetentionCount`, default 14) los va limpiando solo al superar el límite. Los descargados a
`~/Downloads/` durante la verificación se borraron manualmente. El re-seed no afecta la bitácora
(es append-only) ni los respaldos existentes.

---

*Siguiente entrega (previa aprobación): **Fase 14 — Pruebas**: instalar Vitest; unit sobre
servicios de dominio (costing, FEFO, transiciones); integración de casos de uso críticos contra una
BD de test separada; formalizar los `scripts/test-*.mts` existentes en suites reproducibles.*
