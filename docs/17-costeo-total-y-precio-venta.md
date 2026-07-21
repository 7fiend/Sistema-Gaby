# Fase 17 — Entrada por costo total + precio de venta editable
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-11 · **Estado:** Completada y verificada

---

Primera entrega fuera de la hoja de ruta original (Fases 1–16, ya cerrada) — pedida directamente
por el cliente. Dos cambios pequeños y independientes, ambos ya confirmados por el cliente antes
de construirlos.

## 1. Entrada de inventario: costo total en vez de costo unitario

El formulario de entrada (`EntryDialog`, `client/src/features/inventory/StockDialogs.tsx`) pedía
"Costo unitario (COP)" — el dueño tenía que calcular a mano cuánto salía el kilo/gramo antes de
escribirlo. Ahora pide **"Costo total de la compra (COP)"** (lo que trae la factura: ej. 15 kg de
carne por $150.000) y muestra en vivo el costo por unidad resultante (`→ Costo unitario: $10.000 /
kg`) antes de enviar.

**Sin cambios de backend.** `entrySchema`/`registerEntry` siguen recibiendo `unitCost` exactamente
igual que antes (`costo total ÷ cantidad`, redondeado a 4 decimales — misma resolución que
`avgCost`/`lastCost` en la BD) — el cálculo vive enteramente en el formulario, un esquema Zod
local (`entryFormSchema`, solo para esta UI, nunca se manda al servidor) que valida cantidad y
costo total como positivos.

## 2. Precio de venta editable en Recetas

Antes, lo único relacionado a precio en una receta era `suggestedPrice` — siempre calculado desde
`costPerPortion` y `targetMarginPct`, y **reescrito automáticamente** en cada recálculo en cascada
(cuando cambia el costo promedio de un ingrediente). No existía ningún campo donde el dueño
pudiera fijar el precio real al que vende el plato y ver la ganancia resultante.

### Modelo de datos
`Recipe.sellingPrice` — `Decimal?` nuevo (migración `20260711190758_add_recipe_selling_price`),
nullable (`null` = todavía no se ha fijado). A diferencia de `currentCost`/`costPerPortion`/
`suggestedPrice`, **`refreshCosts()` (el recálculo en cascada) nunca lo toca** — es la única
diferencia real de diseño: los otros tres son costos derivados, este es una decisión de negocio.
Verificado en vivo: se fijó `sellingPrice=4000` en una receta, se registró una entrada de
inventario de un ingrediente de esa receta (disparando la cascada), y `sellingPrice` siguió en
`4000` mientras `costPerPortion`/`suggestedPrice` sí cambiaron.

### UI — `RecipeDetailPage.tsx`
Sección nueva "Precio de venta y rentabilidad": input editable (precargado con `sellingPrice` si
ya existe, o con `suggestedPrice` como punto de partida si no), y dos valores calculados en vivo
mientras se escribe — **Ganancia por porción** (`precio − costo/porción`) y **Margen real**
(`ganancia ÷ precio × 100`, redondeado), en rojo si dan negativo. "Guardar precio" llama al
endpoint de actualización de receta que ya existía (`PUT /recipes/:id`) pero que hasta ahora
ninguna pantalla usaba. También se agregó el campo (opcional) en `RecipeEditorPage.tsx` para
poder fijarlo desde la creación.

### `sellingPrice` como valor por defecto en Ventas
Al confirmar el alcance original se decidió dejar el precio editable solo en Recetas (Ventas
seguiría pidiendo el precio en cada registro, sin rellenarlo). El cliente pidió agregarlo después,
en el mismo hilo. `SalesPage.tsx` (`SalesCaptureForm`) **ya tenía** un mecanismo de precarga al
elegir receta (`onChange` del `<select>`, hasta ahora usaba `recipe.suggestedPrice`) — cambio de
una línea: `recipe.sellingPrice ?? recipe.suggestedPrice`. Si la receta tiene precio de venta
fijado, se usa ese; si no (`null`), cae al sugerido igual que antes. El precio sigue siendo
editable después de precargado, y no pisa un valor que el usuario ya haya escrito a mano (misma
protección `!(unitPrice > 0)` que ya existía). Cero cambios de backend — `recipesApi.list()` ya
traía `sellingPrice` desde el punto 2.

## 3. Verificación (todo en ejecución real)

- `npm run typecheck` limpio en los 3 workspaces.
- `npm run test:e2e` — **175/175 PASS**, las 8 suites (sin cambios necesarios: `test-9a.mts` ya
  ejercita entradas/recetas contra la API directamente, que no cambió de contrato).
- `npm test` (Vitest) — **58/58 PASS**.
- Navegador real, flujo completo:
  1. Entrada de 15 kg / $150.000 de Carne de res → costo unitario en vivo mostró **$10.000/kg**
     antes de enviar; al registrar, "Último costo" pasó a $10.000 y "Costo promedio" se recalculó.
  2. Receta "Almuerzo Ejecutivo": precio de venta fijado en 4.000 → Ganancia $2.666, Margen real
     67% (calculado en vivo, antes de guardar); "Precio de venta actualizado" al guardar;
     **persistió tras recargar la página completa**.
  3. Cascada: nueva entrada de un ingrediente de esa receta → `costPerPortion`/`suggestedPrice`
     cambiaron, `sellingPrice` se mantuvo en 4.000 (verificado vía API).
  4. Ventas (`/admin/ventas`, día sin registro previo): al elegir "Almuerzo Ejecutivo" el precio
     unitario precargó **4.000** (su `sellingPrice`, no los 3.400 del sugerido); al elegir "Sopa
     del Día" (sin `sellingPrice` fijado) precargó **5.300**, el sugerido — confirma el fallback.
- `npx tsx scripts/test-9b.mts` (ventas/producción/gastos) — **30/30 PASS**, sin regresión.
- BD de prueba `sistema_gaby_test` sincronizada con `prisma db push` (nueva columna).

### Nota operativa
`prisma migrate dev` no pudo regenerar el cliente de Prisma en el primer intento (`EPERM`, DLL
bloqueada por el dev server de `tsx watch` corriendo) — se resolvió deteniendo el proceso,
regenerando, y reiniciando el server. Si esto se repite en otra sesión: detener `npm run dev`
antes de correr una migración, no solo después.

---

*Sin fase siguiente definida — como con la Fase 16, cualquier trabajo nuevo a partir de aquí es
una fase 18 que el cliente pide y aprueba explícitamente.*
