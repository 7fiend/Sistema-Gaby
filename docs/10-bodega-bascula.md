# Fase 10 — Módulo Inventario (Bodega): entregas por báscula
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-08 · **Estado:** Completada y verificada

---

## 1. Backend

### Regla de tolerancia (`domain/services/delivery.ts`, puro)
Decisión de negocio validada con el cliente: la tolerancia es **simétrica contra el pendiente**
(`pending = requiredQuantity − deliveredQuantity`), con dos modos:

- **`complete`** (botón principal): aprueba si `floor = pending − tolerancia ≤ cantidad ≤ pending + tolerancia = limit`. Fuera de ese rango (por exceso o por defecto) → bloquea.
- **`partial`** (acción secundaria, RF-05.4): `floor = 0`, `limit = pending` — omite el chequeo de tolerancia pero **nunca puede exceder el pendiente**.
- `evaluateDelivery(pending, quantity, toleranceApplied, mode)` devuelve `{ approved, withinTolerance, deltaKg }` (deltaKg con signo: negativo = "faltan", positivo = "sobran").
- `recomputeRequirementStatus(deliveredQuantity, requiredQuantity, toleranceApplied)`: `DELIVERED` si el acumulado cae dentro de tolerancia del total, si no `PARTIAL`.

### Entregas (`IDeliveryRepository` + `PrismaDeliveryRepository` + `DeliveryUseCases` + `DeliveryController`)
Módulo independiente (paralelo a `production`, mismo patrón de capas) porque `delivery` ya es
un recurso de permisos propio en la matriz. Una única transacción por intento:

1. Valida que el requirement pertenezca a la orden, que la orden esté `CONFIRMED`/`IN_DELIVERY`
   y que el requirement no esté ya `DELIVERED` (404 / 422 `INVALID_TRANSITION` / 409 `CONFLICT`).
2. Evalúa con `evaluateDelivery`. El registro `Delivery` **siempre se crea** (RN-02, append-only)
   — aprobado o bloqueado, con las lecturas crudas como evidencia (RF-06.4).
3. **Bloqueada**: el requirement pasa a `BLOCKED` (schema: "último intento fuera de tolerancia"),
   sin movimiento de stock.
4. **Aprobada**: consumo FEFO reutilizando la función pura `planFefoConsumption` (misma
   transacción, no la clase `PrismaProductRepository`, que abriría otra transacción), decremento
   atómico de `Product.currentStock` (`{ decrement }`, no leer-y-restar), movimiento `EXIT`, y
   **el movimiento se crea antes que el `Delivery`** para poder enlazar `movementId` en un único
   INSERT — `deliveries` no admite `UPDATE` posterior (trigger de BD, RN-02), así que no se puede
   crear primero y enlazar después.
5. Transición de la orden (RF-04.5, reutiliza `assertTransition`/`PRODUCTION_TRANSITIONS`):
   primera entrega aprobada de la orden → `CONFIRMED → IN_DELIVERY`; cuando todos los
   requirements quedan `DELIVERED` → `IN_DELIVERY → DELIVERED`.

### Endpoint
```
POST /api/v1/production/:orderId/requirements/:reqId/deliveries
Permiso: delivery:deliver
Body:  { quantity: number>0, mode: 'complete'|'partial', source: 'SCALE'|'SIMULATOR'|'COUNT', readings: ScaleReading[] }
201:   { data: { order: ProductionDetail, delivery, approved, withinTolerance, deltaKg } }
```
`approved:false` responde **201** (es un resultado de negocio válido y auditado, no un error HTTP).

### Eventos y alertas
`delivery:completed` (rooms admin/inventory/kitchen) si aprobada; si bloqueada, se audita con
`kind:'SECURITY'`, se crea una alerta persistida `delivery_blocked` (mensaje con el producto y la
diferencia exacta) y se publica `delivery:blocked` (rooms admin/inventory) — ambos eventos y el
mapa de invalidación de React Query ya existían desde fases anteriores, no se tocó `socket.ts`.

### Cambios puntuales en código existente
- `IProductionRepository`/`PrismaProductionRepository`: el detalle de cada requirement ahora
  incluye `isWeighable` (del producto) para que la UI de bodega decida báscula vs. conteo.
- `database/seed.ts`: `ROLE_GRANTS.INVENTORY` ahora incluye `production:read` — el rol `bodega`
  necesita `GET /production/:id` para ver la orden y sus requirements (antes solo tenía
  `delivery`/`inventory`/`products`). Requiere `npm run db:seed` para aplicarse.

## 2. Frontend

### `ScaleService` + `SimulatorDriver` (`client/src/services/scale/`)
Interfaz exacta de `docs/02-arquitectura.md §6`: `ScaleDriver` (`connect/disconnect/status/onReading/tare`)
+ `ScaleService.captureStableWeight()` (N lecturas consecutivas dentro de un delta, RF-06.4).
`SimulatorDriver` (único driver implementado en esta fase — no hay hardware real) emite lecturas
cada ~150 ms alrededor de un peso objetivo con fluctuación configurable; el panel flotante
`SimulatorPanel` (solo con `VITE_SCALE_DRIVER=simulator`) permite fijar el peso, la fluctuación y
forzar desconexión/error, mediante un store zustand compartido (`simulatorStore.ts`).
El **display en vivo** de la pantalla de bodega se alimenta de `onReading` directamente (siempre
fluctuando); el color (gris/verde/rojo) es una ventana deslizante calculada en el hook
`useScaleReading` — **esto es solo UX**, la aprobación real siempre la decide el backend (RN-01).

### UI de bodega (`/bodega`, `/bodega/:orderId`)
- `DeliveryOrderPickerPage`: lista órdenes `CONFIRMED`/`IN_DELIVERY`; auto-redirige si hay una sola.
- `DeliveryPage`: layout del mockup §3.2 — header (orden, progreso, estado de báscula), columna
  izquierda con íconos por estado (✔/⚠/○), columna derecha con `DeliveryWeighPanel`. Sin
  `AdminLayout` (sin sidebar, pantalla de una sola tarea).
- `DeliveryWeighPanel`: número vivo 96 px, tolerancia, botón gigante **CONFIRMAR ENTREGA** (modo
  `complete`, habilitado solo en verde, atajo de teclado **Espacio**) y acción secundaria
  **Registrar entrega parcial** (modo `partial`, deshabilitada solo si excede el pendiente).
  Banner rojo con la diferencia exacta tras un bloqueo.
- `CountStepper`: para `isWeighable:false` (source `COUNT`) — solo incrementos/decrementos, sin
  ningún campo de texto libre (RN-01 aplicado también a conteo, por consistencia de diseño).

## 3. Verificación (todo en ejecución real)

`scripts/test-10.mts` — **33/33 PASS** (server corriendo):

| Prueba | Resultado |
|---|---|
| Entrega completa dentro de tolerancia → aprobada, requirement `DELIVERED`, orden `CONFIRMED→IN_DELIVERY`, stock decrementado exacto (FEFO) | ✅ |
| Reintentar sobre requirement ya `DELIVERED` → `CONFLICT` | ✅ |
| Entrega completa fuera de tolerancia → bloqueada, requirement `BLOCKED`, stock intacto, alerta `delivery_blocked` generada | ✅ |
| Entrega parcial dentro del pendiente (sin chequear tolerancia) → aprobada, acumula, `PARTIAL` | ✅ |
| Entrega parcial que excede el pendiente → bloqueada igual | ✅ |
| Completar exacto → `DELIVERED`; conteo exacto (`isWeighable:false`) → `DELIVERED` | ✅ |
| Completar el resto de insumos → orden transiciona a `DELIVERED` | ✅ |
| Entregar sobre una orden ya `DELIVERED` → `INVALID_TRANSITION`; `reqId` ajeno → `NOT_FOUND`; cantidad ≤0 → `VALIDATION_ERROR` | ✅ |
| Permisos: `cocina` bloqueada (403); `bodega` puede leer la orden y registrar la entrega | ✅ |

`tsc --noEmit` en los 3 workspaces ✅.

Navegador real (`VITE_SCALE_DRIVER=simulator`, login `bodega`): picker con 6 órdenes activas,
selección de insumo, número gris fluctuando → **verde** al fijar el peso del simulador dentro de
tolerancia (botón habilitado), confirmación con **clic y con la tecla Espacio**, ícono ✔ y avance
automático al siguiente insumo pendiente, progreso `1/7 → 2/7` en vivo. Stepper de conteo para
"Bandeja desechable" (`isWeighable:false`) sin campo de texto. Intento fuera de tolerancia →
número **rojo** "FUERA DE TOLERANCIA", botón principal deshabilitado; **Registrar entrega
parcial** aprobó una cantidad menor sin bloquear; un segundo intento al límite de tolerancia
mostró el banner rojo "Faltan 0,050 kg" con el ícono de la lista cambiando a ⚠. Simulador de
báscula: desconexión reflejada en el header ("báscula: desconectada") y en el texto del panel;
reconexión restableció las lecturas. Consola sin errores.

### Cambio de permisos
`ROLE_GRANTS.INVENTORY` en `database/seed.ts` ahora incluye `production:read` (ver §1). Ya
aplicado con `npm run db:seed`.

### Datos de prueba que quedan en la BD
Órdenes `OP-2026-0006/0008/0009/0010/0012` (ciclo completo de `test-10.mts`, re-ejecutable),
entradas de inventario `TEST-10-*` en CAR-001/GRA-001/EMP-001, alertas `delivery_blocked` sin
leer, y la orden `OP-2026-0013` creada manualmente en el navegador (parcialmente entregada). El
re-seed no los limpia; reset total: `npx prisma migrate reset` en `server/`.

---

*Siguiente entrega (previa aprobación): **Fase 11 — Módulo Cocina**: monitor kiosco con tarjetas
por receta y % de insumos entregados en tiempo real, detalle a pantalla completa con ingredientes
escalados a las porciones del día, auto-rotación configurable, F11 fullscreen.*
