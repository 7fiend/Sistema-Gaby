# Fase 16 — Documentación
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-11 · **Estado:** Completada y verificada

---

## 1. Qué se construyó

Esta fase no toca código de producción — es documentación pura, la última entrega de la hoja de
ruta original (`docs/00`). Se apoya en las 15 fases anteriores, cada una ya documentada en su
propio archivo; el trabajo acá fue reunir eso en material que le sirva a alguien que **no** haya
seguido la construcción paso a paso: quien instale el sistema en un PC nuevo, quien lo use a
diario, o quien tenga que moverlo a otro servidor.

### `README.md` completo
Se expandió de una guía mínima de arranque a punto de entrada real del repo: variables de entorno
con tabla de referencia, estructura completa, los 3 módulos con enlace directo a su manual,
comandos (incluyendo `npm test`/`npm run test:e2e`/`npm run build`, que no existían cuando se
escribió la versión original antes de las Fases 14–15), y una tabla con los 16+ documentos de
`docs/` para no tener que adivinar cuál leer.

### `.env.example` — un vacío real que se llenó
El README ya decía "copiar de `.env.example`" desde su primera versión (Fase 6), pero ese archivo
**nunca existió** — ni en `server/` ni en `client/`. Cualquiera que intentara seguir esa
instrucción se habría quedado sin saber qué variables poner. Se crearon los dos, con cada
variable comentada (qué es, si es obligatoria, cómo generarla si es un secreto).

### Manuales por módulo (`16-manual-admin.md`, `16-manual-bodega.md`, `16-manual-cocina.md`)
Guías de usuario final, no técnicas — escritas para quien opera el sistema, no para quien lo
programó. Se recorrieron los tres módulos en el navegador (no solo el código) antes de escribirlos,
para describir la UI real: nombres de botones, atajos de teclado (Espacio para confirmar entrega,
Esc para volver, F11 pantalla completa), qué pasa exactamente cuando algo se bloquea o falla.

### Guías de instalación y migración
- `16-guia-instalacion.md`: PC Windows sin nada instalado → sistema corriendo, incluyendo
  instalar PostgreSQL, generar secretos JWT propios (nunca reusar los de otro entorno) y una
  tabla de problemas comunes.
- `16-guia-migracion.md`: mover la instalación a LAN o VPS. El hallazgo más importante al
  escribirla: la cookie de sesión se marca `secure` automáticamente en `NODE_ENV=production`
  (`auth.controller.ts`), lo que significa que el refresh de sesión **no funciona sin HTTPS** —
  ni siquiera en una LAN interna sin certificado. Quedó documentado como una decisión explícita
  con dos salidas (HTTPS con certificado autofirmado para la LAN, o quedarse en modo desarrollo
  si el uso es esporádico), no como una nota al margen.

### `CLAUDE.md` actualizado
Llevaba desde la Fase 12 diciendo "Completado: Fases 1–12, Siguiente: Fase 13" — quien abriera el
repo después de la Fase 15 habría arrancado con información falsa sobre dónde estaba el proyecto.
Actualizado a Fases 1–16, con los comandos nuevos de Vitest/E2E-orquestado/build, y la lista de
documentos por fase completa hasta la 16.

## 2. Verificación

Al ser documentación, la "verificación" es de exactitud, no de comportamiento del sistema:

- Cada comando de instalación que se puede probar sin modificar el equipo se probó: generación de
  secreto JWT (`node -e "..."`) ejecutada y confirmada (64 caracteres hex, sobre el mínimo de 32).
  El flujo de modo producción (`npm run build -w client` + `NODE_ENV=production`) ya se había
  verificado de punta a punta en la Fase 15 (servidor en puerto aislado, estáticos + SPA fallback
  + gzip + 404 real de API) — la guía de instalación documenta exactamente ese flujo ya probado.
- Los tres manuales de módulo se escribieron después de recorrer `/admin` (producción, recetas),
  `/bodega` (pantalla de entrega con el simulador de báscula) y `/cocina` (vista de grid y detalle,
  auto-rotación) en el navegador real — no se inventó ningún nombre de botón ni atajo de teclado.
- Todos los enlaces internos nuevos (README → docs/16-*, manuales, guías) se verificaron contra
  el sistema de archivos — los 7 archivos nuevos existen donde el README y CLAUDE.md dicen que
  existen.
- `npm run typecheck` limpio en los 3 workspaces (esta fase no tocó ningún `.ts`/`.tsx`, es
  puramente `.md`/`.env.example` — se corrió de todas formas para confirmar que no hubo ningún
  cambio accidental).

## 3. Qué NO se hizo (a propósito)

No se agregó una licencia de código abierto ni archivos de tipo `CONTRIBUTING.md`/`CODE_OF_CONDUCT.md`
— este es un proyecto comisionado para un cliente específico, no un proyecto open source; esos
archivos no aportan nada aquí y hubieran sido ceremonia sin destinatario real.

---

*Hoja de ruta original completa (Fases 1–16). Sin fase siguiente definida — cualquier trabajo
nuevo a partir de aquí es una decisión del cliente, no una continuación ya planeada.*
