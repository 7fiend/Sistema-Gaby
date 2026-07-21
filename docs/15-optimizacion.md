# Fase 15 — Optimización
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-11 · **Estado:** Completada y verificada

---

## 1. Inter Variable self-hosted (RNF-01, pendiente desde Fase 6)

El token `--font-sans: "Inter", ...` existía desde la Fase 4 pero **nunca se había provisionado
la fuente** — sin `@font-face` ni link a Google Fonts, todo navegador sin Inter instalada
localmente caía silenciosamente a `system-ui`. Se extrajo el archivo variable real
(`@fontsource-variable/inter`, instalado temporalmente solo para copiar el `.woff2` y
desinstalado — no queda como dependencia) a `client/public/fonts/inter-variable.woff2` (47 KB):
un solo archivo, subset `latin` (cubre tildes y `ñ` del español), eje de peso completo 100–900 vía
`format('woff2-variations')`, sin itálica (no se usa en la UI). `@font-face` nuevo en
`globals.css`, mismo `font-family: "Inter"` que ya usaba el token — cero cambios en el resto del
CSS. Verificado en navegador: `document.fonts` reporta a Inter como `loaded`, y la petición de red
sale de `localhost:5173/fonts/...` (nunca `fonts.googleapis.com`).

## 2. Build de producción servido desde Express (RNF-02: un solo puerto)

`client/package.json#build` ya hacía `tsc --noEmit && vite build` desde antes — solo faltaba que
el servidor supiera qué hacer con `client/dist`. En `server/src/app.ts`, **solo si `!isDev`**:
`express.static(CLIENT_DIST)` + una ruta catch-all (`app.get('/*splat', ...)` — Express 5 exige
wildcards nombrados, `'*'` a secas ya no es válido) que sirve `index.html` para cualquier GET que
no empiece por `API_PREFIX`, dejando pasar las rutas de API reales a `notFoundHandler` (JSON 404,
no HTML). En desarrollo, Vite sigue sirviendo `:5173` con proxy a la API — nada cambia ahí.

Verificado arrancando un server aparte en `NODE_ENV=production PORT=3099` (puerto aislado, sin
tocar los `:3000`/`:5173` de desarrollo): `/` y una ruta de cliente (`/admin/reportes`) sirven
`index.html`; `/api/v1/health` sigue respondiendo; `/api/v1/no-existe` da 404 JSON (no se lo traga
el catch-all); el asset JS sale con `Content-Encoding: gzip`; la fuente sale con
`Content-Type: font/woff2`.

## 3. Compresión HTTP

`compression()` (paquete nuevo) montado primero en la cadena de middleware, antes de CORS —
comprime tanto las respuestas JSON de la API como los estáticos de `client/dist` en producción.
Verificado con `curl -H "Accept-Encoding: gzip"` contra un asset real (`Content-Encoding: gzip`
confirmado, ver §2).

## 4. `sonner.tsx` — dejó de depender de `next-themes`

La Fase 4/6 instaló `next-themes` como parte del setup por defecto de shadcn/ui para el
`<Toaster>`, pero el proyecto **nunca montó** su `<ThemeProvider>` — el estado de tema real vive
en un store propio de Zustand (`@/stores/theme`, con persistencia y `prefers-color-scheme`) desde
la Fase 6. Efecto real: `useTheme()` de `next-themes` siempre devolvía el default `"system"`
porque no había contexto que lo alimentara, así que los toasts **nunca reflejaban de verdad** el
tema activo de la app. Cambiado a `useTheme` del store propio (mismo nombre, import distinto);
`next-themes` desinstalado del `package.json` del cliente (sin más usos). Verificado en
navegador alternando el tema con el toggle real de la UI y disparando un toast (creación de
respaldo) en cada modo: fondo oscuro/texto claro en modo oscuro, fondo claro/texto oscuro en modo
claro — antes de esta fase, siempre se veía igual sin importar el tema activo.

## 5. Índices de rendimiento y N+1

**Los índices ya estaban bien puestos.** Revisando `database/schema.prisma` contra los patrones
reales de consulta de cada repositorio (rango de fechas en reportes, filtros de auditoría,
kardex, etc.), cada fase fue agregando el índice correspondiente sobre la marcha (`@@index` con
comentarios explicando el porqué). No se encontró ninguna consulta de acceso frecuente sin
cobertura — no se agregó ningún índice nuevo.

**Un N+1 real corregido**: `PrismaProductionRepository.kitchenSummary()` ya tenía un comentario
"evita N+1" para steps/notas (una sola consulta batcheada por `recipeId`), pero dos líneas más
abajo volvía a llamar `currentVersionOrThrow()` (con su propio `findFirst` + includes de
ingredientes) **una vez por receta distinta del día**, dentro de un `for`. Se fusionó en la misma
consulta batcheada (`findMany({ where: { recipeId: { in: recipeIds } } })` con el include completo
de ingredientes), eliminando la llamada por receta. `GET /kitchen/summary` es el endpoint que
alimenta el monitor de cocina (polling continuo en un kiosco) — el que más se beneficia de esto en
la práctica. Verificado con `test-11.mts` (17/17, incluye la agregación por receta con
ingredientes escalados) sin cambios de comportamiento.

Otros bucles con una consulta por ítem revisados y **dejados como están a propósito**: 3 sitios
más en `PrismaProductionRepository` (`create`/`explodeDraft`/`confirm`) llaman
`currentVersionOrThrow` por ítem de la orden — una orden típica tiene pocas líneas, no miles, y
cada ítem necesita su propia validación individual (receta desactivada, snapshot de costo
distinto por línea); no vale la complejidad de pre-cargar y mapear para este volumen. Los bucles
de consumo FEFO (`PrismaProductRepository`/`PrismaDeliveryRepository`) y de recálculo de costos en
cascada (`PrismaRecipeRepository.recalculateForProducts`) escriben una cantidad **distinta** por
ítem — son N escrituras legítimas, no el antipatrón N+1 de lectura repetida.

## 6. `/dev/realtime-test` fuera de development

Revisado: ya estaba correctamente gateado por `if (isDev)` en `routes/index.ts` desde que se
creó (Fase 8) — no hay ninguna ruta accesible en producción. Sin cambios.

## 7. `package.json#prisma` → `prisma.config.ts`

**Diferido a propósito.** El plan original lo ata a "cuando se suba a Prisma 7" — seguimos en
Prisma 6.16, y migrar ahora sería puro *busywork* sin motivo (el warning de deprecación es
informativo, no bloquea nada). Se revisita cuando haya una razón real para subir de versión mayor.

## 8. Bug encontrado y corregido de paso: `test-realtime.mts` crasheaba al salir

Verificando la Fase 15 con la suite E2E completa (`scripts/run-e2e.mts`, Fase 14), apareció una
falla intermitente en `test-realtime.mts`: las 3 aserciones pasaban pero el proceso terminaba con
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` (crash nativo de libuv, específico de
Windows). Causa: `process.exit()` inmediatamente después de `socket.close()` no le daba tiempo a
`socket.io-client` a cerrar sus handles internos antes de que el proceso muriera a la fuerza.
Fix: `process.exitCode = ...` en vez de `process.exit()` — dejar que Node termine solo cuando el
event loop se vacía (que ya ocurre justo después de que el socket cierra limpio), sin forzar nada.

## 9. Bug encontrado y corregido de paso: `deliveredPct` flaky en `test-11.mts`

Al re-verificar la suite completa varias veces durante esta fase, `test-11.mts` falló
intermitentemente en "deliveredPct sube tras una entrega real" (mismo valor antes/después). Causa
real — no la que decía el comentario existente ("porciones no suficientemente dominantes"):
`kitchenSummary` suma cantidades **crudas** entre insumos de distinta unidad
(`ProductionRequirement.requiredQuantity`, sin normalizar), y el test entregaba
`confirmed.requirements[0]` — el primer insumo del array, no necesariamente uno relevante. Si ese
insumo tiene una cantidad requerida pequeña frente al resto (ej. sal en 0,1 kg vs. carne en 15 kg),
entregarlo completo apenas mueve `delivered/required` de esa orden, sin importar cuán grande sea
la orden en porciones. Fix real: entregar el insumo de **mayor** `requiredQuantity`, no el
primero — el salto pasó de invisible (redondeo) a 15-20 puntos porcentuales, estable en corridas
repetidas. Se subió también `PORTIONS` de 50 a 300 como margen adicional frente a la acumulación
de datos de pruebas del mismo día (el resumen de cocina agrega solo "hoy").

## 10. Verificación (todo en ejecución real)

```
npm run typecheck          → limpio en los 3 workspaces
npm test (-w server)       → 58/58 PASS (Vitest, sin cambios de la Fase 14)
npm run test:e2e           → 175/175 PASS, 8/8 suites (repetido varias veces, estable)
npm run build -w client    → build real (1.12 MB / 325 KB gzip; ver nota abajo)
```
Servidor de producción probado en un puerto aislado (`NODE_ENV=production PORT=3099`, sin tocar
los servers de desarrollo activos): estáticos, fallback SPA, 404 de API real, gzip y fuente
verificados con `curl` (detalle en §2–3). Navegador real: fuente Inter cargando desde
`/fonts/inter-variable.woff2` (`document.fonts` → `loaded`), toasts siguiendo el tema con el
toggle real de la UI en ambos modos (ver §1 y §4).

### Nota pendiente, no bloqueante: tamaño del bundle
`vite build` avisa que el chunk principal supera 500 KB (1,12 MB sin comprimir, 325 KB gzip —
todo en un solo archivo, sin code-splitting por ruta). Para una app local de un solo restaurante
(localhost o LAN, no servida por CDN a usuarios remotos) esto carga en bien menos de un segundo en
cualquier equipo moderno — no se justificó invertir en `React.lazy()`/`manualChunks` para esta
entrega. Queda anotado por si en una fase futura se sirve la app a usuarios remotos con conexiones
lentas.

### Hallazgo sin resolver, reportado al cliente: fila de respaldo atascada en "En curso…"
Durante la verificación manual del toggle de tema (§4) se notó que la lista de Respaldos tiene una
fila del 10/07/2026 permanentemente en estado "En curso…". Causa (estructural, no un bug de esta
fase): `pg_dump` captura el snapshot de la base **en el momento exacto** en que arranca — que es
DESPUÉS de crear la fila del respaldo (estado `RUNNING`) pero ANTES de marcarla `COMPLETED`. Si ese
respaldo se usa después para restaurar, la base restaurada trae **su propia fila todavía en
RUNNING** (así estaba la BD en el instante del dump) — y nada la actualiza nunca después, porque
ese `UPDATE` ya ocurrió en la línea de tiempo original, no en la restaurada. Cualquier restauración
deja este rastro. No se tocó en esta fase (Fase 15 es optimización, no correcciones de Fase 13) —
queda para que el cliente decida si vale la pena un fix dedicado (ej. no confiar en el propio
`Backup.status` post-restauración, o excluir la fila de sí mismo del dump).

---

*Siguiente entrega (previa aprobación): **Fase 16 — Documentación**: README completo, manual por
módulo (admin/bodega/cocina), guía de instalación limpia en otro PC, guía de migración a servidor
LAN/VPS, CLAUDE.md actualizado.*
