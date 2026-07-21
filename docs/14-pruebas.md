# Fase 14 — Pruebas
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-11 · **Estado:** Completada y verificada

---

## 1. Vitest + BD de prueba dedicada

Se instaló **Vitest** solo en el workspace `server` (donde vive toda la lógica de dominio y
casos de uso — `shared` es únicamente esquemas Zod/enums, y `client` no tenía lógica no-UI que
justificara pruebas en esta entrega).

### Decisión: BD separada (`sistema_gaby_test`), no schema separado
Se creó una segunda base de datos en el mismo Postgres local, `sistema_gaby_test`, sincronizada
con `prisma db push` (no `migrate deploy`): para una BD de pruebas desechable no hace falta el
historial de migraciones, y `db push` es lo que Prisma recomienda para este caso. Efecto
colateral a tener presente: los triggers de inmutabilidad (`audit_logs`/`reports`/etc., escritos
a mano en `database/migrations/.../migration.sql`, fuera del schema de Prisma) **no existen** en
`sistema_gaby_test` — es intencional (la BD de pruebas no necesita esa protección) pero significa
que un `deleteMany` sobre `audit_logs` que fallaría en dev/producción funciona sin problema ahí.

### Aislar `DATABASE_URL` sin arriesgar la BD de desarrollo
`server/.env.test` (nuevo, gitignored — igual que `.env`) define **solo** `DATABASE_URL` (apuntando
a `sistema_gaby_test`) y `NODE_ENV=test`; el resto de variables (secretos JWT, `PG_BIN`, etc.) se
heredan de `server/.env` normalmente. El orden de carga es la parte delicada:
`tests/setup-env.ts` (referenciado en `vitest.config.ts` como `setupFiles`) llama
`dotenv.config({ path: '.env.test' })` **antes** de que cualquier test importe `config/env.ts`
(que hace `import 'dotenv/config'`, cargando `.env`); como `dotenv` nunca sobrescribe una variable
ya definida en `process.env`, `DATABASE_URL`/`NODE_ENV` quedan fijos en los de prueba y el resto
se completa desde `.env` sin duplicar secretos. El setup además **lanza un error si
`DATABASE_URL` no contiene `sistema_gaby_test`** — un candado explícito para que un typo o un
`.env.test` faltante nunca termine corriendo pruebas destructivas contra la BD real.

`vitest.config.ts` corre los archivos de prueba **sin paralelismo entre archivos**
(`fileParallelism: false`): las pruebas de integración comparten la misma BD de prueba, y
correrlas en paralelo pisaría datos entre ellas.

## 2. Unit tests — `domain/services/*.test.ts` (colocados junto al código)

**45/45 PASS.** Los 4 servicios de dominio (funciones puras, sin I/O) se probaron exhaustivamente
por tabla de casos:
- `costing.test.ts`: promedio ponderado (caso normal, stock inicial en 0, stock resultante ≤ 0),
  costo de receta, costo por porción (incluyendo rendimiento 0), precio sugerido (con el
  redondeo hacia arriba a la centena y el acotamiento de margen 0–95%), y los 3 helpers de
  redondeo.
- `fefo.test.ts`: consume primero el lote más próximo a vencer, los lotes sin fecha van al final,
  avanza al siguiente lote cuando el primero no alcanza, cantidad sin cubrir queda "sin lote",
  ignora lotes con `remainingQuantity` en 0, cantidad 0 no consume nada.
- `production.test.ts`: **todas** las transiciones declaradas en `PRODUCTION_TRANSITIONS` se
  aceptan (recorrido exhaustivo del mapa, no casos sueltos), una no declarada se rechaza con
  `BusinessRuleError` (incluyendo el contenido de `details`), explosión consolidada (escala por
  porciones, conversión a unidad base, consolidación entre recetas, redondeo a 3 decimales), y
  `toDateOnlyUTC` (el caso RN- de evitar el corrimiento de día).
- `delivery.test.ts`: modo `complete` (aprueba/rechaza en el borde exacto de tolerancia, signo de
  `deltaKg`) y modo `partial` (aprueba cualquier cantidad ≤ pendiente sin exigir tolerancia,
  rechaza exceso y cantidad negativa) — la regla completa de RF-05.3/RF-05.4.

## 3. Integration tests — `tests/integration/*.test.ts` (contra `sistema_gaby_test` real)

**13/13 PASS.** Se priorizaron 2 casos de uso "críticos" (no los ~15 casos de uso del sistema —
ver alcance más abajo) que ejercitan transacciones reales de Prisma, no solo la lógica pura ya
cubierta por los unit tests:

- **`inventory.test.ts`** (`PrismaProductRepository.registerEntry`/`registerAdjustment`): primera
  entrada fija el promedio, segunda entrada lo pondera correctamente, se crean lote + movimiento
  `ENTRY` reales en la BD, un `WASTE` consume FEFO y no cambia el promedio, se detecta cuando un
  ajuste cruza el stock mínimo, salida que excede el stock se rechaza (`BusinessRuleError`),
  producto inexistente se rechaza (`NotFoundError`).
- **`auth.test.ts`** (`Login`, con `Argon2Hasher`/`JwtTokenService` reales, no mocks): contraseña
  incorrecta sin filtrar si el usuario existe, login exitoso crea sesión y resetea intentos,
  **bloqueo tras N intentos fallidos** (RN-07) con `lockedUntil` en el futuro, cuenta bloqueada
  rechaza incluso con la contraseña correcta, y cada evento de seguridad queda auditado
  (`kind: 'SECURITY'`, incluyendo `auth.login.lock-triggered`/`auth.login.locked`).

### Alcance deliberadamente acotado
Producción (explosión + snapshots + tolerancias) y Entregas (FEFO + máquina de estados) **no**
tienen integration tests dedicados en Vitest — su fixture (receta versionada + ingredientes +
orden + requirements) es sustancialmente más profundo que inventario/auth, y esos flujos **ya
están cubiertos end-to-end** por los scripts E2E (`test-9b`, `test-10`, `test-11`) contra el
servidor real. Se prefirió invertir el tiempo disponible en dejar 2 casos de uso realmente sólidos
y en formalizar el E2E existente (§4) antes que fixtures superficiales de más casos.

## 4. E2E formalizado — `scripts/run-e2e.mts`

Los 8 scripts `scripts/test-*.mts` (9a/9b/9c/10/11/12/13/realtime) ya eran suites E2E reales
contra el servidor corriendo — lo que faltaba era un punto de entrada único y reproducible en vez
de recordar y correr cada uno a mano. `run-e2e.mts` (nuevo, `npm run test:e2e` desde la raíz):
- Verifica primero `GET /health` y aborta con un mensaje claro si el server no está corriendo (en
  vez de que cada script falle por separado con errores de conexión confusos).
- Corre los 8 scripts **en el orden documentado en CLAUDE.md** (no alfabético — `10`/`11`/`12`/`13`
  irían antes que `9a`-`9c` alfabéticamente).
- Cada script sigue corriendo como proceso hijo independiente (`node --import tsx <script>` — se
  evita `spawn(..., {shell:true})` con un args array: en Windows pasa por `cmd.exe`, que corta
  rutas con espacios como "Sistema Gaby" al reconstruir el comando).
- Parsea la línea `Resultado: N PASS, M FAIL` que cada script ya imprimía y arma un resumen
  agregado con tabla final; código de salida no-cero si cualquier suite falló (apto para CI).

### Bug real encontrado y corregido: `test-9a.mts` dependía de un lote agotable
Al formalizar la corrida completa, `test-9a.mts` falló: su prueba de FEFO buscaba un lote llamado
`LOTE-INICIAL` (creado una sola vez por el seed, con `update: {}` a propósito — no se repone en
cada re-seed para no deshacer consumo real de pruebas) que **ya se había agotado** por corridas
acumuladas de sesiones anteriores desde el 2026-07-07. El detalle de producto solo lista lotes con
`remainingQuantity > 0` (`PrismaProductRepository.findBatches`), así que el lote simplemente
"desapareció" de la respuesta. No era una regresión de fases posteriores — era una suite que nunca
había sido diseñada para sobrevivir un número indefinido de corridas.
**Fix**: el script ahora crea sus propios 2 lotes por corrida (`TEST-9A-NEAR-*` con vencimiento en
2 días y exactamente la cantidad que se va a mermar, `TEST-9A-FAR-*` sin problema de vencimiento
cercano) — la prueba de FEFO ya no depende de ningún dato sembrado y es reproducible
indefinidamente. Verificado corriendo `test-9a.mts` dos veces seguidas sin fallos.

## 5. Verificación (todo en ejecución real)

```
npm run test -w server     → 58/58 PASS  (45 unit + 13 integración)
npm run test:e2e           → 175/175 PASS (8 suites E2E contra el server real)
npm run typecheck          → limpio en los 3 workspaces (server/tsconfig.json ahora incluye tests/)
```

Repetido dos veces cada comando para confirmar re-ejecutabilidad (unit/integración/E2E son
idempotentes; ver §3 para el detalle de limpieza de fixtures en integración).

### Datos que quedan en las BD
- `sistema_gaby_test`: un puñado de filas huérfanas en `audit_logs` (intentos de login contra un
  usuario inexistente, sin `userId` — no las limpia el `afterAll` de `auth.test.ts` porque filtra
  por `userId`). Sin consecuencia real (BD desechable); reset total si se quiere:
  `npm run test:db:push -w server` con `--force-reset` (requiere confirmación explícita, Prisma la
  exige para operaciones destructivas).
- `sistema_gaby` (dev): un respaldo `MANUAL` más por cada corrida de `test-13.mts` dentro de
  `run-e2e.mts` (mismo comportamiento ya documentado en la Fase 13).

---

*Siguiente entrega (previa aprobación): **Fase 15 — Optimización**: fuente Inter self-hosted,
build de producción servido desde Express, índices de rendimiento, compresión HTTP, quitar/gatear
`/dev/realtime-test` fuera de development.*
