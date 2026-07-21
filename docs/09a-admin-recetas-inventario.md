# Fase 9a — Módulo Administrador: Recetas + Inventario
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-06 · **Estado:** Completada y verificada

---

## 1. Backend

### Servicios de dominio (puros, sin dependencias)
- `costing.ts`: promedio ponderado móvil, costo de receta, costo/porción, precio sugerido (redondeado a centena COP), redondeos explícitos (2/3/4 decimales).
- `fefo.ts`: plan de consumo de lotes — primero el que vence; lotes sin vencimiento al final.

### Inventario
- CRUD de productos (código único, categoría, proveedor, unidad base, mínimo, ubicación, pesable/conteo, tolerancia propia).
- **Entrada** (`POST /inventory/entries`): transacción atómica → lote + movimiento ENTRY con `balanceAfter` + stock + **promedio ponderado calculado dentro de la transacción** + `lastCost`. Dispara el **recálculo en cascada** de las recetas que usan el producto (RF-02.4) y publica `stock:changed` / `recipe:cost-changed`.
- **Ajustes/mermas** (`POST /inventory/adjustments`): tipos ADJUSTMENT_IN/OUT, WASTE, LOSS, EXPIRY; validación de stock dentro de la transacción (`INSUFFICIENT_STOCK`); consumo **FEFO** de lotes; salidas valoradas al promedio vigente (RN-03). Si el stock cruza el mínimo → alerta persistida + evento `stock:low`.
- Kardex por producto (`GET /products/:id/movements`) paginado.
- Errores Prisma mapeados centralmente (P2002→409 duplicado, P2025→404, P2003→409).

### Recetas
- Crear = receta + **versión 1** + ingredientes, con costos calculados en la misma transacción.
- Editar info (margen/rendimiento recalculan precio); **revisar = nueva versión** (RF-02.5) marcando la anterior como histórica — las producciones pasadas nunca se corrompen.
- `recalculateForProducts(productIds)`: el corazón de la cascada — recalcula solo las recetas cuya **versión vigente** usa los productos afectados.
- Todo mutador audita (kind CRUD/INVENTORY) y publica eventos.

*Decisión de altitud:* casos de uso agrupados por agregado (`InventoryUseCases`, `RecipeUseCases`) — un archivo por operación sería ceremonia sin beneficio; cada método público es un caso de uso.

## 2. Frontend

- **`DataTable`** común: búsqueda, paginación en servidor, filas clicables, toolbar de filtros — todos los listados del sistema la reutilizan.
- **Inventario**: lista con filtro por categoría y "Stock bajo" (badge ámbar), formulario de producto (React Hook Form + Zod compartido, selects de catálogos), **detalle con 4 KPIs, lotes en orden FEFO y kardex** con badges por tipo de movimiento; diálogos de Entrada y Ajuste/Merma (motivo obligatorio → auditoría).
- **Recetas**: lista con costo/porción y precio sugerido; **editor con filas de ingredientes dinámicas y estimación de costo EN VIVO** (espejo del cálculo del servidor, marcada como estimación); detalle con KPIs, ingredientes costeados, pasos numerados, historial de versiones y diálogo "Nueva versión".
- Toasts globales (sonner) para éxito/error con los mensajes del backend.

## 3. Verificación (todo en ejecución real — 11/11 PASS)

| Prueba | Resultado |
|---|---|
| Promedio ponderado: 80 kg @ $22.000 + 20 kg @ $25.000 → **$22.600 exacto** | ✅ |
| Cascada de recetas: Almuerzo $7.638 → **$7.788/porción** (+150 = 2,5 kg × $600 ÷ 10) | ✅ |
| FEFO: merma de 5 kg consumió LOTE-INICIAL (vence antes), lote nuevo intacto | ✅ |
| Stock insuficiente → `INSUFFICIENT_STOCK` 422 | ✅ |
| Kardex con ENTRY y WASTE y saldos correctos (100 → 95) | ✅ |
| Crear receta → costo calculado; revisar → **v2** con v1 en histórico | ✅ |
| `bodega` intentando crear producto → 403 FORBIDDEN | ✅ |
| Navegador: lista de inventario con datos reales, detalle con lotes/kardex, lista y detalle de recetas con costos en cascada | ✅ (screenshots en la sesión) |
| `tsc --noEmit` en los 3 workspaces | ✅ |

---

*Siguiente entrega (previa aprobación): **9b — Producción diaria + Ventas + Gastos**: crear orden, explosión de ingredientes consolidada, verificación de disponibilidad, confirmación con snapshots y envío a bodega/cocina en tiempo real; registro de ventas del día; CRUD de gastos.*
