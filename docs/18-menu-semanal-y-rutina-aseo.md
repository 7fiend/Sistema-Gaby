# Fase 18 — Menú semanal, recomendación por inventario y rutina de aseo
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-21 · **Estado:** Completada y verificada

Fuera de la hoja de ruta original — pedida por el cliente (cocina de dietas clínicas: comidas
normales, dietas líquidas, blandas, etc.), tras la Fase 17.

---

## 1. Requerimiento del cliente

1. El sistema no dejaba crear categorías nuevas (solo lectura desde siempre).
2. Cada día de la semana se repiten las mismas recetas por tipo de dieta y tiempo de comida
   (desayuno, dos meriendas, almuerzo, cena) — querían configurarlo una vez y que el sistema
   supiera "qué toca hoy", editable cuando cambie.
3. Si al día que toca le falta inventario, que el sistema sugiera otra receta de la misma dieta
   que sí tenga inventario completo.
4. Al crear el lote de producción, entrar por tiempo de comida → tipo de dieta con cantidades,
   no por receta suelta.
5. Los productos de aseo no se pesan en báscula — se consumen por una rutina diaria manual de
   cantidad variable.

## 2. Backend

### Modelo de datos (migración `fase18_weekly_menu_and_routine_products`)
- Enums nuevos: `WeekDay` (7 días), `MealTime` (`BREAKFAST`, `MORNING_SNACK`, `LUNCH`,
  `AFTERNOON_SNACK`, `DINNER` — dos meriendas, fijos y en ese orden), `ProductUsageType`
  (`RECIPE` | `ROUTINE`).
- `Product.usageType` (default `RECIPE`): `ROUTINE` marca productos que nunca pasan por
  báscula/tolerancia/entregas.
- `WeeklyMenuSlot` (día×tiempo de comida×categoría → receta), única por esas 3 columnas.
  Configuración viva (no versiona como las recetas); `recipeId: null` limpia la celda.

### Categorías (RF antes ausente)
- `ICatalogRepository`/`PrismaCatalogRepository`: `createCategory`/`updateCategory`/
  `setCategoryActive`, nuevos junto al `listCategories` que ya existía.
- `CategoryUseCases` (separado de `GetCatalogs`, que sigue siendo solo lectura).
- Rutas nuevas: `POST/PUT /catalog/categories`, `POST /catalog/categories/:id/deactivate`
  (permiso `categories:create/update/deactivate`, solo admin). El listado sigue abierto a
  cualquier autenticado, sin cambios.

### Menú semanal + recomendación
- `IWeeklyMenuRepository`/`PrismaWeeklyMenuRepository.getMenuForDate`: para cada categoría
  RECIPE activa × cada `MealTime`, resuelve el slot del día de la semana de la fecha pedida,
  calcula si hay stock para el **rendimiento base** de la receta (`explodeRequirements`,
  reutilizado de `domain/services/production.ts`) y, si falta, busca la primera receta activa
  de la **misma categoría** con inventario completo como sugerencia.
- `GET /menu/slots` (grilla completa para el admin) · `PUT /menu/slots` (asigna/limpia una
  celda) · `GET /menu/today?date=` (menú resuelto de una fecha) — permiso `menu:read`/`update`.

### Rutina de aseo
- Reutiliza el mecanismo existente de ajustes de inventario (`InventoryUseCases.
  registerAdjustment`, FEFO + kardex + alerta de stock bajo) — **no** se creó tabla nueva de
  movimientos ni lógica de descuento paralela.
- `registerRoutineConsumption`: valida que cada producto sea `usageType=ROUTINE`, y por cada
  entrada con cantidad > 0 llama a `registerAdjustment` con `type=ADJUSTMENT_OUT` y motivo fijo
  `"Rutina de aseo diaria"`.
- `POST /inventory/routine-consumption` con permiso dedicado `routine:register` —
  **a propósito no reutiliza `inventory:adjust`** para no darle a bodega permiso de hacer
  ajustes/mermas arbitrarios de cualquier producto (ese límite ya existía desde la Fase 9a).
- `productsQuerySchema` gana el filtro `usageType` (reutilizando `products:read`, que bodega
  ya tenía) para listar los productos de rutina en la pantalla de bodega.

### Permisos nuevos (`shared/permissions` + `database/seed.ts`)
`categories: [create, update, deactivate]` (solo ADMIN) · `menu: [read, update]` (`read` también
para `KITCHEN` e `INVENTORY`, `update` solo ADMIN) · `routine: [register]` (`INVENTORY` y ADMIN).

## 3. Frontend

- **Categorías** (`/admin/categorias`): pestañas por tipo (dietas/insumos/gastos), listado +
  diálogo crear/editar/desactivar. Reutiliza `DataTable` envolviendo el array plano en un
  `Paginated` sintético (sin paginación real, el catálogo es pequeño).
- **Menú semanal** (`/admin/menu-semanal`): pestañas por día, grilla tiempo de comida×categoría,
  cada celda es un `<select>` de recetas de esa categoría — al cambiar, `PUT /menu/slots`
  inmediato.
- **Menú de hoy** (`/admin/menu-hoy`): selector de fecha, agrupado por tiempo de comida,
  semáforo "Hay stock"/"Sin stock suficiente" + texto de sugerencia si existe.
- **Producción → Nueva orden**: rediseñada. Antes era una lista plana de recetas sueltas; ahora
  la sección principal es la matriz tiempo de comida×categoría (resuelta vía `/menu/today` para
  la fecha elegida) con un campo de porciones por celda — la receta se resuelve sola. Si la
  celda no tiene asignación en el menú semanal, se habilita un `<select>` de respaldo (decisión
  del cliente: no bloquear la orden). Si la receta programada no tiene stock y hay sugerencia,
  aparece un `<select>` con las dos opciones para elegir cuál producir. Debajo se mantiene una
  sección "Recetas sueltas" para casos especiales (eventos, encargos puntuales) — matriz y
  sueltas se fusionan en un solo array antes de enviar (sumando porciones si coinciden en la
  misma receta).
- **Rutina de aseo** (`/bodega/rutina-aseo`, sin sidebar como el resto de Bodega): checklist de
  productos `usageType=ROUTINE` con cantidad usada hoy (manual, variable) — botón nuevo en el
  picker de órdenes de Bodega.
- Inventario: `ProductFormDialog` gana el selector "Tipo de consumo" (Receta/Aseo).

## 4. Verificación (todo en navegador real, 2026-07-21)

| Prueba | Resultado |
|---|---|
| Crear categoría "Dieta líquida" (RECIPE) y "Aseo" (PRODUCT) desde `/admin/categorias` | ✅ |
| Asignar recetas en `/admin/menu-semanal` (lunes y martes, varias celdas) — persisten al recargar | ✅ |
| `/admin/menu-hoy` (martes 21/07/2026): 3 recetas asignadas al almuerzo muestran "Hay stock" | ✅ |
| Merma total de Yuca (ingrediente de "Sopa del Día") → `/admin/menu-hoy` pasa a "Sin stock suficiente" (sin alternativa en Sopas, categoría con una sola receta) | ✅ |
| `/admin/produccion/nueva`: matriz resuelve automáticamente Almuerzo Ejecutivo/Bandeja Especial, celda "Dieta líquida" sin asignación habilita selector manual, "Sopa del Día" muestra advertencia sin stock | ✅ |
| Crear orden desde la matriz (20 + 15 porciones, sin tocar recetas sueltas) → `OP-2026-0084` con los 2 items y 35 porciones totales | ✅ |
| Crear producto "Jabón líquido" con `usageType=ROUTINE`, entrada de 10 l | ✅ |
| `/bodega/rutina-aseo` (rol `bodega`) solo lista productos de rutina; registrar 2 l descuenta stock y el kardex muestra `Ajuste −` con motivo "Rutina de aseo diaria" | ✅ |
| Usuario `bodega` accede a `/bodega/rutina-aseo` pero es redirigido fuera de `/admin/categorias` (permiso `dashboard:read` ausente) | ✅ |
| `tsc --noEmit` en los 3 workspaces | ✅ |

**Hallazgo no relacionado, reportado aparte (no corregido en esta fase):** al crear/editar un
producto dejando "Tolerancia báscula (kg)" vacío, el formulario rechaza el envío con
"Debe ser mayor a 0" en vez de guardarlo como `null` (tolerancia global) — bug preexistente
desde antes de la Fase 18 en `ProductFormDialog.tsx`/`productSchema`, no en código nuevo de
esta fase.

**Datos de prueba dejados en la BD** (mismo criterio que fases anteriores — no se limpian):
categorías "Dieta líquida" y "Aseo"; producto `ASE-001` Jabón líquido con su entrada y su ajuste
de rutina; asignaciones de menú semanal en Lunes y Martes; merma total sobre Yuca (queda en
0 kg, dispara alerta de stock bajo); orden `OP-2026-0084` en borrador.

---

*Sin fase siguiente definida. Cualquier trabajo nuevo a partir de aquí es una fase 19 a pedir/aprobar por el cliente.*
