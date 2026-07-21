# Fase 9c — Módulo Administrador: Dashboard + Usuarios + Configuración
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-07 · **Estado:** Completada y verificada

---

## 1. Backend

### Dashboard (`IDashboardRepository` + `PrismaDashboardRepository` + `DashboardUseCases`)
- `GET /dashboard/summary?date=YYYY-MM-DD` (permiso `dashboard:read`): el **cliente envía su fecha local** — el servidor nunca adivina la zona horaria de "hoy" (las columnas de negocio son `@db.Date` en UTC).
- Devuelve en una sola respuesta:
  - **KPIs de hoy con valor de ayer** (la UI calcula el delta): ventas (Σ `sale_items.total`), costo de producción (Σ `totalCostSnapshot` de órdenes CONFIRMED→CLOSED — nunca DRAFT/CANCELLED, RN-03), gastos, utilidad = ventas − costo − gastos, porciones vendidas.
  - **Serie de 14 días completa**: el caso de uso rellena los días sin datos con ceros para que los gráficos no salten fechas.
  - **Top 5 recetas** (porciones y total vendidos) y **top 5 ingredientes** (cantidad requerida en unidad base + costo estimado con el promedio vigente — informativo, los históricos viven en snapshots).
- Los volúmenes son diminutos (un restaurante, 14 días): se consulta lo mínimo con Prisma y se consolida en memoria — sin SQL crudo, todo verificable por el compilador.

### Centro de alertas
- `GET /alerts?limit=` y `POST /alerts/:id/read` (permiso `dashboard:read`). `markRead` con `updateMany` → `NOT_FOUND` limpio si el id no existe; queda en auditoría (`alert.read`).
- `IAlertRepository.listUnreadByType(type)` nuevo — deduplicación del cron.

### Cron de vencimientos (`GenerateExpiryAlerts` + `infrastructure/jobs/expiry-cron.ts`)
- Barrido de lotes con existencias (`remainingQuantity > 0`, producto activo) cuyo `expiryDate ≤ hoy + inventory.expiryAlertDays` (usa el índice `productId+expiryDate`), vía `IProductRepository.findExpiringBatches`.
- **Idempotente**: si el lote ya tiene una alerta `stock_expiring` NO leída, no la duplica; marcarla leída y seguir venciendo la re-crea al día siguiente (a propósito).
- Publica `stock:expiring` (salas admin+inventory) y `alert:new` (admin) tras crear; audita `SYSTEM inventory.expiry-scan` solo cuando creó algo.
- Programación: **al arrancar el servidor + diario 6:00 América/Bogotá** (node-cron). La corrida de arranque existe porque el PC del restaurante suele estar apagado de madrugada.

### Usuarios (`UserUseCases` + extensión de `IUserRepository`/`PrismaUserRepository`)
- `GET /users` (paginado, búsqueda por username/nombre, `includeInactive`), `GET /users/roles`, `POST /users`, `PUT /users/:id`, `POST /users/:id/deactivate`, `POST /users/:id/reset-password` — permisos `users:read/create/update/deactivate`.
- El **username nunca se edita** (es la identidad en auditoría); email `''` → `null` (es único en BD).
- **Revocación de sesiones** (los permisos viajan en el JWT): cambiar rol, desactivar o restablecer contraseña → `revokeAllForUser` — el refresh muere al instante y el access token viejo expira en ≤15 min.
- **Candados**: nadie puede cambiar su propio rol ni desactivar su propia cuenta (`VALIDATION_ERROR`). Username duplicado → `CONFLICT`.
- `reset-password` también pone `failedAttempts=0, lockedUntil=null` — **desbloquea cuentas** desde la UI (antes era SQL a mano, ver notas operativas de docs/00).
- Auditoría con vista sin credenciales (`auditView`): jamás se registra un hash ni contraseña.

### Configuración (`SettingsUseCases` + `ISettingsRepository.getAll/setMany`)
- `GET /settings` (permiso `settings:read`) / `PUT /settings` (`settings:update`, parcial): 9 parámetros en camelCase para la UI, mapeados a `SETTING_KEYS` (báscula, margen, días de vencimiento, bloqueo de cuentas, respaldos). Defaults = seed si la clave no existe.
- Solo persiste **lo que cambió** (upserts en transacción) y audita `settings.update` con before/after completos.

Esquemas Zod nuevos en `@gaby/shared`: `dashboard.ts`, `users.ts` (contraseña con los criterios de Fase 7; cron de 5 campos validado), `settings.ts`. Dependencia nueva: `@types/node-cron` (dev).

## 2. Frontend

- **Skill `dataviz` aplicada** (regla 9 de CLAUDE.md): paleta de series **validada con su script** sobre las superficies reales (`--card` blanco y zinc): claro `#059669/#2563eb/#d97706` (ΔE CVD 89.2), oscuro `#059669/#3b82f6/#d97706` (banda L 0.48–0.67, ΔE 80.1); par divergente verde/rojo validado en ambos modos. Tokens `--chart-*` en `globals.css` — los gráficos cambian de tema solos.
- **Dashboard** (`features/dashboard/`):
  - 4 stat tiles con **delta vs ayer** (flecha + color = dirección × si subir es bueno; % si ayer ≠ 0, monto absoluto si ayer = 0) y porciones vendidas.
  - **Ventas y costos (líneas, 14 días)**: 3 series categóricas con leyenda propia, líneas 2px sin puntos, grid hairline solo horizontal, tooltip crosshair con dots de identidad; eje Y compacto (`$160 k`).
  - **Utilidad diaria (barras divergentes)**: el signo lo da la **posición sobre/bajo el eje cero** y el color lo refuerza; extremo de dato redondeado 4px, base cuadrada, ≤24px de ancho.
  - **Centro de alertas**: icono por tipo (stock bajo / por vencer / entrega bloqueada), hora es-CO, botón "marcar leída" (invalida `['alerts']`). Los eventos socket ya invalidaban `['dashboard']` y `['alerts']` desde la Fase 8 — el dashboard es en vivo sin código nuevo.
  - **Top recetas / ingredientes**: listas con barra secuencial de un solo matiz (sin ejes).
- **Usuarios** (`features/users/`): `DataTable` (usuario+nombre, correo, rol en español, estado Activo/Inactivo/Bloqueado, creado), filtro "incluir inactivos", diálogos de crear (contraseña inicial con pista de requisitos), editar (rol/estado deshabilitados sobre uno mismo, con explicación) y restablecer contraseña (avisa que desbloquea y cierra sesiones).
- **Configuración** (`features/settings/`): formulario único sobre `settingsSchema` agrupado en 5 secciones (báscula, costeo, inventario, seguridad, respaldos) con ayuda por campo, indicador "hay cambios sin guardar" y guardado deshabilitado sin cambios.
- Rutas `/admin/usuarios` y `/admin/configuracion` reemplazan sus placeholders. Dependencia nueva: `recharts`.

## 3. Verificación (todo en ejecución real)

`scripts/test-9c.mts` — **36/36 PASS** (server corriendo, re-ejecutable):

| Prueba | Resultado |
|---|---|
| Serie de 14 días completa, ascendente, último día = hoy, utilidad = ventas − costo − gastos en cada día, KPIs = última fila | ✅ |
| Un gasto nuevo mueve el KPI de gastos exactamente +$12.345 y la utilidad −$12.345 | ✅ |
| Top de recetas y porciones > 0 con datos en la ventana | ✅ |
| Alerta `stock_low` forzada (salida que cruza el mínimo + compensación), visible en `GET /alerts`, desaparece al marcarla leída; id inexistente → `NOT_FOUND` | ✅ |
| Usuarios: crear, duplicado → `CONFLICT`, login del nuevo, **cambiar rol revoca sesiones (refresh → 401)** | ✅ |
| Candados: mi propio rol / mi propia cuenta → `VALIDATION_ERROR` | ✅ |
| Reset: contraseña vieja muere, nueva sirve, débil → `VALIDATION_ERROR`; desactivar → login rechazado | ✅ |
| Permisos: `cocina` bloqueada en usuarios/dashboard/alertas (403); auditor lee configuración pero no edita | ✅ |
| Settings: PUT aplica y persiste, restauración, tolerancia negativa y cron inválido → `VALIDATION_ERROR` | ✅ |

**Cron de vencimientos verificado con reinicios reales**: entrada `TEST-9C-EXPIRY` (Vaso 12 oz, vence en 2 días) → al reiniciar el server aparece **1** alerta `stock_expiring`; segundo reinicio → **sigue siendo 1** (idempotencia).

Regresión: `test-9a.mts` **11/11** · `test-9b.mts` **30/30** · `test-realtime.mts` **3/3** · `tsc --noEmit` en los 3 workspaces ✅.

Navegador (admin real, claro y oscuro): KPIs con deltas correctos (utilidad negativa del día de prueba en rojo), tooltip crosshair del gráfico de líneas, alerta del lote TEST-9C-EXPIRY visible, tops poblados (Carne de res $87.459); Usuarios con filtro de inactivos (test9c Auditor·Inactivo) y diálogo de edición; Configuración con valores reales, "hay cambios sin guardar", guardado con toast y restauración. Consola sin errores; indicador "en vivo" verde.

### Decisiones y matices
- **La fecha "hoy" viaja del cliente al servidor** (`?date=`) — un dashboard local no puede depender del reloj/zona del servidor.
- El costo de producción del dashboard usa **solo snapshots congelados** (RN-03); el costo de top ingredientes usa el promedio vigente y se rotula "estimado".
- `expiryDate` de lotes es `DateTime` (no `@db.Date`): la alerta lo formatea en América/Bogotá igual que el detalle de producto (9a), por lo que un lote capturado como "09/07" puede mostrarse "8/07". **Pendiente Fase 10**: considerar migrar `expiryDate` a `@db.Date` y unificar con `formatDateOnly`.

### Datos de prueba que quedan en la BD
Gasto "Gasto de prueba E2E 9c" ($12.345, hoy), venta de hoy (7 Almuerzos, si no existía), usuario `test9c` (desactivado, rol Auditor), ajustes compensados en Aceite vegetal (deja alertas `stock_low` históricas), lote `TEST-9C-EXPIRY` en Vaso 12 oz con su alerta `stock_expiring`. El re-seed no los limpia; reset total: `npx prisma migrate reset` en `server/`.

---

*Siguiente fase (previa aprobación): **Fase 10 — Módulo Inventario (Bodega) + Báscula**: `ScaleService` con SimulatorDriver, entregas con tolerancia validada EN SERVIDOR, salidas FEFO, transiciones CONFIRMED→IN_DELIVERY→DELIVERED y UI `/bodega` con peso vivo.*
