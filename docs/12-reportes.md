# Fase 12 — Reportes
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-08 · **Estado:** Completada y verificada

---

## 1. Backend

### Decisión de diseño: forma genérica `ReportResult`
En vez de 9 tipos de reporte (RF-12.1) × 3 formatos de export (27 combinaciones), cada tipo se
reduce a una forma común:
```ts
interface ReportResult {
  type; from; to; generatedAt; title; notes?;
  columns: { key; header; align? }[];
  rows: Record<string, string | number>[];
  summary?: Record<string, string | number>;
}
```
Con esta forma única, **un solo generador por formato** (`exceljs` para XLSX/CSV, `pdfkit` para
PDF — ninguna estaba instalada, se agregaron a `server/package.json`) sirve para los 9 tipos.

De los 9 tipos, **4 reutilizan código existente sin cambios** (`PrismaDashboardRepository`, ya
recibía `from`/`to` libres — el límite de 14 días es del caso de uso del dashboard, no del
repositorio):
- `profit` → `dailyTotals(from,to)`.
- `top_recipes` / `sales` → `topRecipes(from,to,limit alto)`.
- `top_ingredients` → `topIngredients(from,to,limit alto)`.

Los otros 5 (`production`, `expenses`, `inventory_value`, `waste`, `recipe_profitability`) viven
en un repositorio nuevo, `PrismaReportsRepository` (mismo estilo que `PrismaDashboardRepository`:
consulta varias tablas directamente y consolida en memoria, sin forzar composición a través de
`ISaleRepository`/`IExpenseRepository`/etc., que no tienen las formas de agregación que necesita
cada reporte).

### Limitaciones documentadas
- **`inventory_value`** es una foto del **momento actual** — no hay snapshots históricos de
  stock, así que el rango de fechas se ignora (`ReportResult.notes` lo avisa explícitamente).
- **`recipe_profitability`** usa `productionOrderItem.totalCostSnapshot` (costo histórico
  congelado al confirmar, RN-03) en vez de `recipe.costPerPortion` "vigente" — así un reporte de
  un rango pasado no cambia si el costo actual de la receta cambia después. Ventas y costo se
  suman **independientemente** por receta (mismo criterio que `profit = ventas − costo − gastos`
  en `dailyTotals`, no emparejados venta-por-venta contra una producción específica).
- **`waste`** combina dos orígenes en una tabla: (a) `production_requirements` del rango
  (requerido vs. entregado — RF-01 "merma teórica vs. real"), (b) movimientos de inventario
  `WASTE`/`LOSS`/`EXPIRY` del rango, valorizados. No se puede separar el desperdicio por receta
  dentro de una orden que consolida insumos entre varias recetas (mismo límite que Fase 11).

### Persistencia y export
`Report` (tabla ya existente desde Fase 3, sin migración nueva) vía `PrismaReportRepository`
(mismo estilo que `IAlertRepository`). `ReportUseCases.export()`: genera el resultado, escribe el
archivo en `UPLOADS_DIR/reports/<tipo>-<timestamp>.<ext>` (`env.UPLOADS_DIR`, definido desde
Fase 5 pero nunca usado hasta ahora), inserta la fila (si falla, borra el archivo huérfano),
audita (`kind:'SYSTEM'`). Los reportes son **append-only** (RF-12.3): nunca se actualizan ni
eliminan, solo se regeneran (nueva fila + nuevo archivo cada vez).

### Endpoints
```
GET  /reports/:type            perm reports:generate   → JSON ReportResult (no persiste)
POST /reports/:type/export     perm reports:export      → archivo binario + persiste
GET  /reports                  perm reports:read        → historial paginado
GET  /reports/:id/download     perm reports:read         → archivo ya generado
```
`export`/`download` son las **únicas rutas del backend que no usan el envelope `{data}`** — el
éxito es el archivo binario (`Content-Disposition: attachment`); los errores previos al streaming
siguen el envelope de error normal. Los permisos `reports:read/generate/export` y el modelo
`Report` ya existían desde las Fases 1–3; no hizo falta tocar `database/seed.ts` (`ADMIN` los
hereda vía `() => true`, `AUDITOR` obtiene `reports:read` vía `a === 'read'` pero no
`generate`/`export` — verificado en el E2E).

## 2. Frontend

- `client/src/lib/api.ts`: nuevo helper `downloadFile()` — el cliente HTTP existente siempre
  espera `{data}` JSON; un archivo binario rompe ese contrato, así que se agregó una función
  aparte con el mismo manejo de 401/refresh que `request()`, pero que devuelve un `Blob` y
  dispara la descarga con una ancla sintética (`URL.createObjectURL` + click + revoke).
- `client/src/features/reports/ReportsPage.tsx` (reemplaza el `PlaceholderPage`): selector de
  tipo (9 opciones) + rango de fechas (30 días por defecto) + tabla de resultados con columnas
  dinámicas (`ReportResult.columns`) y fila de totales; 3 botones de exportación; historial
  paginado (`DataTable` real) con descarga por fila.

## 3. Verificación (todo en ejecución real)

`scripts/test-12.mts` — **27/27 PASS** (server corriendo), con un día sintético único (pasado)
por corrida para no chocar con otras pruebas E2E:

| Prueba | Resultado |
|---|---|
| Ventas/top_recipes/top_ingredients/producción/gastos/utilidad reflejan los datos creados en el propio script, en el día sintético | ✅ |
| Rentabilidad por receta = ventas − costo snapshot de producción | ✅ |
| Mermas: entrega parcial refleja requerido vs. entregado | ✅ |
| Inventario valorizado = stock actual × costo promedio (con aviso de que el rango no aplica) | ✅ |
| Movimiento WASTE sube el valor de mermas de inventario (prueba por delta, robusta a otras corridas) | ✅ |
| Export CSV/XLSX/PDF: archivo real no vacío, content-type correcto | ✅ |
| Historial paginado + descarga de un reporte ya generado | ✅ |
| Permisos: `cocina`/`bodega` bloqueados; `auditor` lee el historial pero no genera ni exporta | ✅ |

Regresión: `test-10.mts` **33/33**, `test-11.mts` **17/17**, `tsc --noEmit` en los 3 workspaces ✅.
Archivos verificados en disco (`uploads/reports/`) y contenido de un CSV inspeccionado a mano
(encabezados y totales correctos).

Navegador real (`admin`, `/admin/reportes`): reporte de ventas generado con el rango por defecto
(30 días) mostrando "Almuerzo Ejecutivo" agregado correctamente entre varias órdenes de prueba, y
el historial de reportes ya generados por el script E2E visible con acción de descarga. (Sesión
interrumpida por límite de uso de las herramientas de navegador antes de probar manualmente cada
uno de los 9 tipos y los 3 formatos de exportación uno por uno — la cobertura automatizada del
script E2E ya ejerce esas 27 rutas end-to-end contra el servidor real, incluyendo los archivos
binarios generados y verificados en disco).

### Datos de prueba que quedan en la BD
Ventas y gastos "Gasto de prueba E2E 12" en fechas sintéticas muy pasadas (única por corrida);
órdenes de producción "Orden de prueba E2E 12"; entradas de inventario `TEST-12-*`; varios
ajustes `WASTE` de 1 kg sobre Carne de res ("Prueba E2E 12"); filas en `reports` y sus archivos en
`uploads/reports/`. El re-seed no los limpia; reset total: `npx prisma migrate reset` en
`server/` (no borra los archivos ya escritos en `uploads/reports/`, solo las filas de la BD).

---

*Siguiente entrega (previa aprobación): **Fase 13 — Auditoría (UI) + Respaldos**: DataTable sobre
`audit_logs` con filtros y diff before/after; `PgDumpBackupService` con respaldo manual/programado
y restauración con confirmación fuerte.*
