# Manual de usuario — Administrador

Guía de uso del panel de administración (`http://localhost:5173/admin`). Pensada para quien
opera el día a día del restaurante desde el computador de oficina: dueño/a, administrador/a,
persona de costos.

No es un manual técnico — para arquitectura, decisiones de diseño y detalle de cada endpoint, ver
los documentos numerados en `docs/`.

---

## Entrar al sistema

1. Abre `http://localhost:5173` en el navegador.
2. Usuario y contraseña que te haya creado el administrador principal.
3. Si te equivocas la contraseña varias veces seguidas, la cuenta se bloquea unos minutos por
   seguridad — espera y vuelve a intentar, o pide a un administrador que te la restablezca desde
   **Usuarios**.

La sesión se mantiene mientras el navegador esté abierto. El punto verde "en vivo" arriba a la
izquierda indica que estás conectado en tiempo real: si alguien más registra una venta, hace una
entrega o completa una producción, lo vas a ver reflejado sin recargar la página.

## Menú lateral

El menú tiene dos grupos: **Operación** (lo que se usa a diario) y **Sistema** (administración y
configuración). Qué ves depende de tu rol — un usuario `auditor`, por ejemplo, puede leer todo
pero no puede crear ni editar nada.

## Dashboard

Resumen del día y de los últimos 14 días:
- **Tarjetas de arriba**: ventas de hoy, utilidad de hoy, costo de producción, gastos de hoy —
  cada una con la variación contra el día anterior.
- **Gráficos**: ventas/costos/gastos y utilidad diaria de las últimas 2 semanas.
- **Alertas**: stock bajo, lotes por vencer, entregas bloqueadas por báscula. Haz clic en el ✓
  para marcarla como leída.
- **Top recetas / Top ingredientes**: lo más vendido y lo que más costó producir en la ventana.

Todo se actualiza solo — no hace falta refrescar la página durante el turno.

## Producción

Aquí se planea y confirma lo que se va a cocinar cada día.

1. **Nueva orden** → elige la fecha, agrega una o más recetas con las porciones a producir, y
   crea el borrador.
2. **Confirmar**: al confirmar una orden, el sistema:
   - Congela el costo de cada receta (aunque el costo de un ingrediente cambie después, esta
     orden conserva el costo con el que se confirmó).
   - Calcula exactamente cuánto de cada ingrediente hace falta (sumando entre todas las recetas
     de la orden) y genera la lista que Bodega va a entregar.
   - Si falta stock de algún ingrediente, te avisa — pero **no bloquea** la confirmación (el
     dueño decide si compra a tiempo o ajusta la orden).
3. Desde ese momento, la orden pasa por bodega (entrega de insumos) y luego por cocina
   (preparación) — ver los manuales de esos módulos para el resto del recorrido.
4. Una orden confirmada se puede **cancelar** solo si todavía no tiene ninguna entrega registrada.
   Una orden completada se puede **cerrar** para archivarla.

## Recetas

CRUD de recetas con costeo automático:
- Cada receta tiene ingredientes (con su cantidad y unidad), pasos de preparación y un
  **rendimiento** (cuántas porciones da un lote).
- El **costo por porción** se recalcula solo cada vez que cambia el costo promedio de un
  ingrediente (por ejemplo, al registrar una entrada de inventario a un precio distinto) — no
  hace falta tocar la receta para que el costo quede al día.
- **Precio sugerido**: se calcula para alcanzar el margen objetivo que configures.
- **Revisar una receta** (cambiar ingredientes o pasos) crea una **versión nueva** — las órdenes
  de producción ya confirmadas quedan con la versión y el costo que tenían en ese momento, nunca
  cambian retroactivamente.
- Desactivar una receta la saca de las listas de producción sin borrar su historial.

## Inventario

- **Listado de productos**: código, categoría, stock actual, costo promedio, si es pesable o se
  cuenta por unidad.
- **Entrada** (compra/ingreso): registra cantidad y costo — el sistema recalcula el promedio
  ponderado del producto automáticamente y, si ese ingrediente entra en alguna receta, el costo
  de esas recetas se actualiza en cascada.
- **Ajustes / mermas**: para corregir stock (sobrante, merma, pérdida, vencimiento). Las salidas
  consumen primero el lote más próximo a vencer (FEFO), sin que tengas que elegir cuál.
- **Kardex** (detalle de un producto): historial completo de movimientos con el saldo después de
  cada uno — es un registro permanente, nunca se edita ni se borra; una corrección siempre es un
  movimiento nuevo que compensa al anterior.
- Las alertas de **stock bajo** y **lotes por vencer** aparecen solas en el Dashboard.

## Ventas

Registro diario de ventas por receta. Solo se permite **un registro por día** — si ya
registraste las ventas de hoy y necesitas corregir algo, edítalo en vez de crear uno nuevo. El
total se calcula siempre en el servidor (porciones × precio unitario de cada línea).

## Gastos

Registro de gastos por categoría (compras, servicios, nómina, etc.), con fecha y descripción.
Se pueden editar después de creados. Los gastos del día entran directo en el cálculo de utilidad
del Dashboard.

## Reportes

Genera reportes por rango de fechas y expórtalos a PDF, Excel o CSV:

| Reporte | Para qué sirve |
|---|---|
| Ventas | Total vendido por receta en el rango |
| Producción | Cada orden confirmada, con su costo congelado |
| Gastos | Totales por categoría |
| Utilidad | Ventas − costo de producción − gastos, día por día |
| Inventario valorizado | Foto del stock actual × costo promedio (no depende del rango de fechas) |
| Desperdicios y mermas | Diferencia requerido vs. entregado en producción, y mermas de inventario valorizadas |
| Rentabilidad por receta | Ventas vs. costo de producción de cada receta |
| Top recetas / Top ingredientes | Los más vendidos / los que más costaron en el rango |

Cada reporte exportado queda guardado en el **historial** de la parte de abajo, con quién lo
generó y cuándo — puedes volver a descargarlo sin regenerarlo.

## Usuarios

Solo accesible para `admin`. Crear, editar y desactivar cuentas; asignar rol (`ADMIN`, `INVENTORY`
= bodega, `KITCHEN` = cocina, `AUDITOR`). El botón **Restablecer contraseña** también desbloquea
la cuenta si estaba bloqueada por intentos fallidos — es la forma normal de destrabar a alguien,
no hace falta tocar la base de datos. Cambiar el rol o desactivar a alguien cierra sus sesiones
abiertas de inmediato.

## Auditoría

Bitácora de todo lo que pasa en el sistema: quién inició sesión, quién creó/editó qué, intentos
de acceso denegados, respaldos creados o restaurados. Filtra por tipo, usuario, rango de fechas o
busca por texto. Haz clic en un registro para ver el detalle completo, incluyendo el estado antes
y después del cambio cuando aplica.

## Respaldos

Copias de seguridad completas de la base de datos:
- **Respaldar ahora**: genera un respaldo manual al instante.
- Los respaldos programados corren solos según el horario que configures en **Configuración →
  Respaldos** (por defecto, todos los días a las 2:00 a.m.).
- **Descargar**: baja el archivo comprimido (`.sql.gz`) a tu computador.
- **Restaurar**: ⚠️ **reemplaza TODOS los datos actuales** por los del respaldo elegido. No se
  puede deshacer, y cierra las sesiones que se hayan abierto después de ese respaldo. Por eso pide
  escribir la palabra `RESTAURAR` como confirmación — solo `admin` puede hacerlo.

## Configuración

Parámetros globales del sistema: tolerancia de báscula, margen de precio sugerido por defecto,
días de anticipación para alertar vencimientos, intentos de login antes de bloquear una cuenta y
minutos de bloqueo, horario y cantidad de respaldos a conservar. Los cambios quedan auditados.
