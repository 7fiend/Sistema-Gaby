# Fase 11 — Módulo Cocina (monitor kiosco de solo lectura)
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-08 · **Estado:** Completada y verificada

---

## 1. Backend

### Endpoint único de lectura
```
GET /api/v1/kitchen/summary?date=YYYY-MM-DD   (opcional; default = fecha del SERVIDOR)
Permiso: kitchen:read
200: { data: { date, recipes: KitchenRecipeCard[] } }
```
`date` es opcional a propósito: el kiosco debe mostrar "el día del restaurante" según el
servidor, no la fecha local (potencialmente mal configurada) de la tablet. Un solo endpoint
sirve tanto el grid como el detalle de receta (ingredientes ya escalados + pasos) en la MISMA
respuesta — evita depender de `recipes:read` (permiso que `cocina` no tiene) y evita exponer
`costPerPortion`/`suggestedPrice`/`currentCost` a un kiosco que no los necesita.

### Agregación por receta (`PrismaProductionRepository.kitchenSummary`)
Reutiliza el patrón de `Map` de `PrismaDashboardRepository.topRecipes`. Para las órdenes activas
del día (`CONFIRMED`, `IN_DELIVERY`, `DELIVERED`, `IN_PREPARATION`, `COMPLETED` — excluye
`DRAFT`/`CANCELLED`/`CLOSED`):

1. Por orden: `orderPct = Σ(requirement.deliveredQuantity) / Σ(requirement.requiredQuantity) × 100` (ponderado por cantidad, no por conteo de requirements, porque las escalas difieren mucho entre insumos — gramos de especias vs. kilos de carne).
2. Por receta, si aparece en varias órdenes del día: promedio de `orderPct` ponderado por `portions` de cada orden.

**Limitación conocida:** los `production_requirements` son **por orden** (consolidados entre
recetas de esa orden si comparten insumos, RF-04.2), no por receta. Si una orden tiene 2 recetas
y solo se ha entregado la mitad de los insumos, AMBAS recetas de esa orden muestran el mismo
`orderPct` — no se puede aislar sin cambiar ese modelo. Es un panel informativo para cocina, no
una fuente de verdad transaccional (esa vive en `/admin/produccion`).

Los ingredientes se escalan con la versión vigente de la receta (`currentVersionOrThrow`, ya
existente) según `totalPortions / yieldPortions`; pasos y notas se resuelven en una sola consulta
adicional agrupada (`recipeVersion.findMany` con `recipeId: {in: [...]}`) para evitar N+1. Si una
receta fue desactivada intra-día, la tarjeta se devuelve sin ingredientes/pasos en vez de romper
el kiosco.

### Transiciones nuevas (genéricas, ya existían en la máquina de estados)
`PRODUCTION_TRANSITIONS` ya declaraba `DELIVERED→IN_PREPARATION` e `IN_PREPARATION→COMPLETED`
desde fases anteriores. Solo hizo falta exponerlas: dos permisos nuevos (`production:start`,
`production:complete`, en `shared/src/permissions/index.ts` y `database/seed.ts` en espejo;
`ADMIN` los hereda automáticamente vía `() => true`) y dos rutas (`POST /production/:id/start`,
`POST /production/:id/complete`) que llaman al mismo `ProductionUseCases.transition` genérico —
cero cambios de lógica de dominio.

## 2. Frontend

- `client/src/features/kitchen/api.ts`: `kitchenApi.summary(date?)`.
- `client/src/features/kitchen/KitchenPage.tsx` (reescritura completa): grid de tarjetas grandes
  (porciones, nombre, barra de progreso con `deliveredPct`) según mockup §3.3; tocar una tarjeta
  (o la auto-rotación) muestra la receta a pantalla completa con ingredientes ya escalados y
  pasos numerados grandes; Escape vuelve al grid y pausa la rotación. Auto-rotación configurable
  (segundos ajustables, botón pausa/reanudar) que recorre las recetas del día cuando no hay
  selección manual. Atajo **F11** (Fullscreen API).
- **Tema oscuro sin fuga**: la versión inicial de este componente (placeholder de fases
  anteriores) mutaba el store global persistido de tema (`useTheme`, `localStorage`), dejando
  el modo oscuro pegado en el resto de la app al salir de `/cocina` — y ni siquiera un cleanup
  en el `useEffect` lo resuelve del todo, porque una navegación dura (recarga, URL directa)
  nunca ejecuta el cleanup y el valor queda persistido. Se corrigió aplicando la clase `dark`
  **localmente** al contenedor raíz del componente (`<div className="dark ...">`) en vez de
  tocar el store: como `globals.css` define las variables de color con el selector `.dark` y
  Tailwind usa `@custom-variant dark (&:is(.dark *))`, la clase se queda scopeada a ese
  subárbol y nunca toca `localStorage` — el resto de la app conserva el tema real del usuario
  sin importar cómo se salga de Cocina.
- `client/src/features/production/ProductionDetailPage.tsx`: dos botones nuevos ("Iniciar
  preparación" en `DELIVERED`, "Marcar completada" en `IN_PREPARATION`), mismo patrón que los
  botones de cancelar/cerrar ya existentes.
- `client/src/lib/socket.ts`: se agregó `['kitchen']` a las invalidaciones de
  `production:confirmed`, `production:status-changed`, `delivery:completed`, `delivery:blocked`
  (ya publicaban a la sala `kitchen`; solo faltaba la invalidación del lado cliente).
- `client/src/features/delivery/DeliveryPage.tsx`: se agregó el mismo atajo F11 (gap de Fase 4
  §3.3 no cubierto en la Fase 10, incluido ahora por decisión explícita).

## 3. Verificación (todo en ejecución real)

`scripts/test-11.mts` — **17/17 PASS** (server corriendo):

| Prueba | Resultado |
|---|---|
| Iniciar preparación antes de `DELIVERED` → `INVALID_TRANSITION` | ✅ |
| Receta aparece en `/kitchen/summary` con porciones e ingredientes escalados proporcionalmente (invariante independiente de otras órdenes del día que compartan la receta) | ✅ |
| `deliveredPct` sube tras una entrega real (reutiliza el endpoint de la Fase 10) | ✅ |
| Orden completa → `DELIVERED` → `start` → `IN_PREPARATION` → `complete` → `COMPLETED`; reintentos rechazados (`INVALID_TRANSITION`) | ✅ |
| Permisos: `cocina` lee `/kitchen/summary` pero NO `/recipes` ni transiciona (`FORBIDDEN`) | ✅ |

Regresión: `test-10.mts` **33/33 PASS**, `tsc --noEmit` en los 3 workspaces ✅.

Navegador real: login `cocina` → `/cocina` en oscuro automáticamente, grid/detalle con datos
reales (134 porciones agregadas de "Almuerzo Ejecutivo" entre varias órdenes de prueba,
ingredientes escalados correctamente: 33,5 kg carne de res, etc.), Escape vuelve al grid y pausa
la rotación, F11 cambia el tamaño de la ventana (fullscreen), botones "Iniciar preparación" →
"Marcar completada" probados en `/admin/produccion` con toasts y cambio de estado correctos.
Confirmado con `localStorage` en `light`: visitar `/cocina` (oscuro) y luego `/admin` mostró
`/admin` en claro — sin fuga de tema. Consola sin errores.

### Datos de prueba que quedan en la BD
Órdenes `OP-2026-0016` a `OP-2026-0023` de "Almuerzo Ejecutivo" con distintas porciones (2 a 50),
en su mayoría `COMPLETED` tras las corridas de `test-11.mts`; entradas de inventario `TEST-11-*`.
El re-seed no los limpia; reset total: `npx prisma migrate reset` en `server/`.

---

*Siguiente entrega (previa aprobación): **Fase 12 — Reportes**: endpoints de agregación por
rango de fechas (ventas, producción, utilidad, inventario valorizado, mermas, rentabilidad por
receta), exportación PDF/Excel/CSV, UI de Reportes.*
