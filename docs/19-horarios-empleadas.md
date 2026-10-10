# Fase 19 — Horarios de empleadas
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-10-10 · **Estado:** Completada y verificada

Fuera de la hoja de ruta original, pedida por el cliente tras la Fase 18. El cliente llevaba el
horario mensual de sus empleadas a mano en Excel ("HORARIO MES DE OCTUBRE DEL 2026"), con
descansos sueltos y sin una regla clara de cobertura.

---

## 1. Reglas acordadas con el cliente

Se definieron en varias rondas de conversación antes de escribir código. Primero se resolvió a
mano el horario de octubre (entregado como Excel y aprobado), y después se automatizó **ese mismo
algoritmo**:

| Regla | Detalle |
|---|---|
| Códigos | `M` 5:00 a.m.–1:00 p.m. · `T` 9:00 a.m.–5:00 p.m. · `C` 5:00 a.m.–1:00 p.m. **y** 3:00–5:00 p.m. (turno partido) · `D` descanso. El antiguo `A` (apoyo) se retiró: ya no hay apoyo. |
| Grupos | **Cocina** (Nuris, Lilibeth): otro horario. El sistema no las genera; se llenan a mano en la misma grilla. **Auxiliares** (Adriana, Gloria, Dunis, Katherine): se generan solas. |
| Descanso | Cada día descansa **exactamente una** de las auxiliares. |
| Katherine | Auxiliar administrativa: cuando trabaja hace siempre `M`, y **descansa fijo sábado y domingo**. Ese descanso ocupa el único cupo del fin de semana, así que las demás auxiliares trabajan todos los fines de semana. |
| Descansos seguidos | Petición de las propias empleadas: descansos de **2 días seguidos** (no sueltos). Las demás auxiliares rotan bloques de 2 días entre semana. Una semana hábil tiene 5 días y 5 no se reparte en bloques de 2, así que el día que sobra se suma al último bloque del tramo (3 días seguidos). Como la rotación avanza, ese día extra le toca a una distinta cada semana. |
| Cobertura | Entre las 3 que trabajan cada día se cubren `M`, `T` y `C`. El turno partido `C` es la pieza clave: la mañana la cubren `M` + `C` y la tarde `T` + `C`. Con la persona de cocina, eso da los "2 auxiliares + 1 de cocina por turno" que pidió el cliente. |
| Reparto parejo | Cada turno lo toma quien lleva menos veces ese turno en el mes; en empate, el orden de la grilla. |
| Entre meses | El orden de quién descansa sigue corrido: cada horario guarda quién va en `nextRestEmployeeId`, y el mes siguiente arranca por ella. |
| Después de publicar | Se puede seguir editando (incapacidades, cambios de turno entre ellas). Cada cambio queda en auditoría con el valor de antes y el de después. Lo que ya no se puede es **regenerar** (409). |

## 2. Backend

### Modelo de datos (migración `fase19_shift_schedules`)
- `Employee`: **no es un `User`**. Las empleadas no necesariamente tienen cuenta en el sistema.
  Campos: `fullName`, `group` (`KITCHEN`/`AUXILIARY`), `fixedShift` (nullable), `fixedWeekendRest`,
  `displayOrder` (orden de la grilla y de la rotación), `isActive`.
- `ShiftSchedule`: uno por mes (`@@unique([year, month])`), `DRAFT`/`PUBLISHED`,
  `nextRestEmployeeId` (continuidad, sin FK a propósito: si esa empleada se desactiva, el mes
  siguiente arranca desde la primera).
- `ShiftAssignment`: empleada × día (`@db.Date`) → código. Una celda vacía no tiene fila.
- Enums nuevos: `EmployeeGroup`, `ShiftCode`, `ScheduleStatus`.

### Dominio puro — `domain/services/shiftSchedule.ts`
- `generateMonthlySchedule(...)`: el algoritmo acordado, generalizado y **sin nombres fijos**.
  Sirve para cualquier número de auxiliares, con o sin alguien de turno o fin de semana fijo.
  Si no hay nadie con descanso fijo de fin de semana, la rotación cubre también sábados y domingos.
- `validateSchedule(...)`: avisos por día (solo para auxiliares): nadie descansa, descansan 2 o
  más, nadie cubre `M`, `T` o `C`, o falta el turno de alguna. **Avisa, no bloquea**, igual que
  los faltantes de Producción.
- Fecha y día de la semana en UTC (calendario real: el 1 de octubre de 2026 es jueves y coincide
  con la plantilla del cliente).

### Casos de uso — `ScheduleUseCases`
- CRUD de empleadas (auditado; desactivar en vez de borrar).
- `getMonth`: horario + empleadas + avisos. Incluye a las inactivas que todavía tienen celdas en
  ese mes, para que los meses pasados no pierdan filas.
- `generate`: crea el mes, o lo **regenera** si sigue en borrador. Solo reemplaza las celdas de las
  auxiliares; lo que se llenó a mano en cocina se conserva.
- `updateAssignment`: valida que la fecha sea de ese mes; audita `schedule.assignment-update` con
  antes/después y el estado del horario.
- `publish`, `exportXlsx`.

### Export a Excel
- Puerto `IScheduleExporter` (capa de aplicación) con su implementación `ExcelScheduleExporter`
  (infraestructura, `exceljs`, ya usado por Reportes). Se genera en memoria y se descarga directo,
  sin guardarse en `reports`.
- Formato de la plantilla del cliente: razón social, NIT, "HORARIO MES DE … DEL …", fila de días y
  días de la semana, colores por turno, leyenda y nota de BORRADOR si no está publicado.
- **Razón social y NIT** se agregaron como configuración (`business.name`, `business.nit`, nueva
  sección "Empresa" en Configuración) en vez de quedar fijos en el código.

### Rutas y permisos
| Ruta | Permiso |
|---|---|
| `GET /employees` · `POST /employees` · `PUT /employees/:id` · `POST /employees/:id/deactivate` | `employees:read/create/update/deactivate` |
| `GET /schedules?year&month` · `GET /schedules/export?year&month` (binario) | `schedules:read` |
| `POST /schedules/generate` | `schedules:generate` |
| `PUT /schedules/:id/assignments` | `schedules:update` |
| `POST /schedules/:id/publish` | `schedules:publish` |

Solo ADMIN tiene todo; AUDITOR lee (automático por la regla de `read`); bodega y cocina no ven
horarios.

## 3. Frontend

- `/admin/horarios` (menú "Horarios"), con dos pestañas:
  - **Horario del mes**: selector de mes; insignia Sin generar / Borrador / Publicado; botones
    Generar, Regenerar (con confirmación que advierte qué se pierde), Publicar (advierte si quedan
    avisos) y Exportar Excel. La grilla usa los mismos colores del Excel; cada celda es un
    `<select>` (`—`/M/T/C/D) con cambio optimista. Fines de semana sombreados, días con aviso en
    rojo, columna "Desc." con los descansos del mes, leyenda y panel de avisos por día.
  - **Empleadas**: listado con las reglas en lenguaje claro ("Siempre M · descansa fines de
    semana") y un diálogo para crear o editar (el turno fijo y el descanso de fin de semana solo
    aparecen para auxiliares).
- Configuración: nueva sección **Empresa** (razón social, NIT).

## 4. Verificación (en ejecución real, 2026-10-10)

| Prueba | Resultado |
|---|---|
| 13 pruebas unitarias del dominio, incluida la que exige que octubre 2026 salga **idéntico** al Excel aprobado, más invariantes en 3 meses seguidos, continuidad y un equipo sin descanso fijo de fin de semana | ✅ |
| API: generar octubre por el sistema da las 4 filas aprobadas exactas, cocina vacía, 0 avisos | ✅ |
| Editar una celda genera "Descansan 2 auxiliares el mismo día · Nadie cubre el turno T"; al revertir desaparece | ✅ (API y navegador) |
| Regenerar en borrador conserva lo llenado a mano en cocina; fecha de otro mes → 400 | ✅ |
| Publicar → regenerar 409; editar publicado 200 y auditado con antes/después | ✅ |
| Export: encabezado con razón social/NIT, días, colores y filas correctas (leído de vuelta con openpyxl) | ✅ |
| Noviembre arranca la rotación con Adriana (continuidad desde octubre), 0 avisos | ✅ |
| Permisos: bodega 403; auditor lee 200, edita 403, crea empleadas 403 | ✅ |
| Navegador: grilla a tamaño escritorio, pestaña Empleadas, diálogo de Katherine con reglas precargadas, sección Empresa | ✅ |
| `npm test`: **71/71** (58 anteriores + 13 nuevas) | ✅ |
| `npm run test:e2e`: **194/194 en 9 suites** (nueva `test-19.mts`, re-ejecutable) | ✅ |
| `tsc --noEmit` en los 3 workspaces | ✅ |

**Datos dejados en la BD de desarrollo** (mismo criterio que fases anteriores): las 6 empleadas
reales (Nuris, Lilibeth, Adriana, Gloria, Dunis, Katherine), creadas por la API y **no** por el
seed, para no meter nombres de personal al repositorio; el horario de octubre 2026 publicado
(idéntico al aprobado; un cambio de prueba en Gloria el día 7 se revirtió y quedó en auditoría) y
el de noviembre 2026 en borrador; razón social y NIT en Configuración. `test-19.mts` deja en cada
corrida un horario de un mes al azar entre 2090 y 2100, con empleadas `TEST-19-*` desactivadas.

---

*Sin fase siguiente definida. Cualquier trabajo nuevo es una fase 20 a pedir y aprobar por el cliente.*
