# Fase 9b — Módulo Administrador: Producción diaria + Ventas + Gastos
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-07 · **Estado:** Completada y verificada

---

## 1. Backend

### Servicio de dominio (`domain/services/production.ts`, puro)
- `assertTransition(from, to)`: valida contra `PRODUCTION_TRANSITIONS` de `@gaby/shared` y lanza `INVALID_TRANSITION` (422) si no aplica.
- `explodeRequirements(items)`: **explosión consolidada** (RF-04.2) — escala cada receta a sus porciones (`portions / yieldPortions`), convierte a unidad base (`factorToBase`) y **suma ingredientes compartidos entre recetas**; redondeo a gramo (round3).
- `toDateOnlyUTC(d)`: normaliza las columnas `@db.Date` (producción, ventas, gastos) a fecha pura UTC — evita el corrimiento de día al formatear en América/Bogotá (el cliente usa `formatDateOnly` con `timeZone: 'UTC'`).

### Producción (`IProductionRepository` + `PrismaProductionRepository` + `ProductionUseCases`)
- **Crear** (`POST /production`): orden DRAFT con consecutivo legible `OP-<año>-####` (último de la secuencia +1, dentro de la transacción); valida recetas activas y captura la **versión vigente** de cada una.
- **Disponibilidad** (`GET /production/:id/availability`): sin mutar — en DRAFT calcula la explosión estimada con versiones vigentes; ya confirmada compara lo **pendiente** (`required − delivered`) contra el stock actual. Los faltantes se **advierten, no bloquean** (RF-04.3).
- **Confirmar** (`POST /production/:id/confirm`), todo en una transacción:
  1. re-resuelve la versión vigente por item y congela `costPerPortionSnapshot` / `totalCostSnapshot` (RN-03 — los costos históricos jamás se reescriben);
  2. materializa la explosión consolidada en `production_requirements` (unidad base, una fila por producto);
  3. congela `toleranceApplied` por requirement: override del producto (`toleranceKg`) o la global `scale.toleranceKg` de app_settings (RN-04);
  4. devuelve los faltantes detectados como advertencia.
  Publica `production:confirmed` a las salas admin + inventory + kitchen (después del commit).
- **Transiciones** (`POST /production/:id/cancel|close`): validadas con la máquina de estados; **CANCELLED exige cero entregas** registradas; CLOSED fija `closedAt`. Publican `production:status-changed`.
- Las transiciones intermedias (IN_DELIVERY→…→COMPLETED) llegan con las fases 10 (entregas) y 11 (cocina); la máquina de estados ya las cubre.

### Ventas (`ISaleRepository` + `PrismaSaleRepository` + `SalesUseCases`)
- `POST /sales`: registro consolidado **único por fecha** (decisión cliente §6.1) — si la fecha ya existe → `CONFLICT` 409. El `total` de cada item se calcula **en el servidor** (porciones × precio, round2). Publica `sales:registered`.
- `GET /sales` paginado con rango de fechas; `GET /sales/day?date=` devuelve el registro del día o `null` (la UI decide entre captura y vista).

### Gastos (`IExpenseRepository` + `PrismaExpenseRepository` + `ExpenseUseCases`)
- `GET/POST /expenses` + `PUT /expenses/:id` (permiso `expenses:update`): categorías kind=EXPENSE, filtros por categoría/rango/búsqueda en descripción. Sin delete (correcciones editan y quedan en auditoría con before/after). Publica `expense:created`.

Todo mutador: transacción + auditoría (`PRODUCTION`/`CRUD`) + evento tras el commit. Esquemas Zod nuevos en `@gaby/shared`: `production.ts`, `sales.ts`, `expenses.ts` (validan front y back; rechazan recetas duplicadas en la misma orden/venta).

## 2. Frontend

- **Producción**
  - Lista con filtros por estado y rango de fechas; badges de estado en español (mapa `status.ts`).
  - **Creación**: filas dinámicas receta×porciones, costo estimado por fila y total, y **explosión estimada EN VIVO con faltantes** (`explosionEstimate.ts`, espejo del dominio; los detalles de receta se cargan con `useQueries`).
  - **Detalle**: KPIs (recetas/porciones/costo congelado), items con versión y snapshots, disponibilidad (estimada en borrador, pendiente-vs-stock ya confirmada) e insumos congelados con tolerancia y estado por requirement.
  - **Confirmación fuerte** (Fase 4 §4): diálogo con resumen y faltantes destacados en rojo antes de congelar; cancelación con diálogo destructivo.
- **Ventas del día**: selector de día (hoy por defecto); si el día no tiene registro → **captura rápida** (el precio se precarga con el `suggestedPrice` de la receta al seleccionarla, editable), totales en vivo y aviso de "un solo registro por fecha"; si ya existe → vista de solo lectura. Historial paginado clicable (navega al día).
- **Gastos**: `DataTable` con búsqueda por descripción, filtros por categoría y rango; diálogo único crear/editar (clic en la fila = corrección auditada).
- Rutas nuevas: `/admin/produccion`, `/admin/produccion/nueva`, `/admin/produccion/:id`, `/admin/ventas`, `/admin/gastos` (placeholders eliminados). Las invalidaciones de React Query por socket ya estaban mapeadas desde la Fase 8.
- Utilidades nuevas: `formatDateOnly` (fechas puras en UTC), `todayISO`, `formatQty`.

## 3. Verificación (todo en ejecución real)

`scripts/test-9b.mts` — **30/30 PASS** (server corriendo):

| Prueba | Resultado |
|---|---|
| Orden DRAFT con consecutivo `OP-2026-####` e incremento secuencial | ✅ |
| Fechas de orden/venta sin corrimiento de día (date-only UTC) | ✅ |
| Explosión consolidada = cálculo independiente del test (11 productos, ingredientes compartidos sumados, unidad base) | ✅ |
| Confirmar: requirements materializados, tolerancia congelada 0,05 kg, snapshot/porción = costo vigente, total = porciones × snapshot | ✅ |
| Máquina de estados: re-confirmar, cerrar desde CONFIRMED y re-cancelar → `INVALID_TRANSITION`; cancelar CONFIRMED sin entregas → OK | ✅ |
| Venta: total calculado en servidor ($801.000), consulta del día, **fecha duplicada → CONFLICT** | ✅ |
| Gastos: crear, corregir (update parcial) y listar filtrado | ✅ |
| Permisos: `cocina` bloqueada al crear producción y registrar ventas (403) | ✅ |

Regresión: `test-9a.mts` **11/11 PASS** (se hizo re-ejecutable: lote y receta de prueba con sufijo único) · `test-realtime.mts` **3/3 PASS** · `tsc --noEmit` en los 3 workspaces ✅.

Navegador (admin real): creación de orden con explosión en vivo y consolidación verificada a mano (Sal 0,115 kg = 0,075 + 0,04; Papa 4,25 kg), confirmación con diálogo fuerte → costo congelado $144.587 y 12 requirements Pendiente ±0,05 kg; Ventas con precio sugerido precargado ($23.100 Bandeja) y vista de día registrado; Gastos con edición precargada. Consola sin errores.

### Datos de prueba que quedan en la BD
Órdenes OP-2026-0001/0002 (canceladas), OP-2026-0003 (confirmada, sirve para probar la Fase 10), venta del 15/10/2014 y un gasto "Gasto de prueba E2E 9b". El re-seed no los limpia; reset total: `npx prisma migrate reset` en `server/`.

---

*Siguiente entrega (previa aprobación): **9c — Dashboard + Usuarios + Configuración**: KPIs reales con delta vs ayer, centro de alertas, top recetas/ingredientes, gráficos 14 días (leer skill `dataviz`), CRUD de usuarios con revocación de sesiones y UI de app_settings + cron de vencimientos.*
