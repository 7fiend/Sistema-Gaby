# Manual de usuario — Bodega

Guía de uso de la pantalla de entregas (`http://localhost:5173/bodega`). Pensada para la persona
que pesa y entrega los insumos a cocina, normalmente en un computador o tablet junto a la báscula.

## Entrar

Abre `http://localhost:5173/bodega` e inicia sesión con tu usuario (rol `INVENTORY`). Esta
pantalla es un **kiosco**: no tiene el menú del panel de administración, va directo a la lista de
órdenes pendientes de entregar.

## Órdenes pendientes

La pantalla inicial muestra todas las órdenes de producción **confirmadas** que todavía tienen
insumos por entregar, con fecha, cuántas recetas y porciones lleva cada una. Toca una tarjeta
para entrar a esa orden.

## Entregar una orden

Dentro de una orden ves la lista de insumos requeridos a la izquierda y, en el centro, el insumo
que estás pesando en este momento con su peso en vivo desde la báscula.

1. Pon el ingrediente en la báscula. El peso que ves en pantalla es el peso real — no se puede
   escribir un número a mano, siempre viene del instrumento.
2. Cuando el peso entra dentro de la **tolerancia** (el margen de más/menos que se permite,
   configurado por el administrador), el botón **CONFIRMAR ENTREGA** se pone activo — también
   puedes usar la tecla **Espacio**.
3. Si el peso está **fuera de tolerancia**, el botón queda deshabilitado y en rojo — no se puede
   forzar. Ajusta la cantidad en la báscula hasta que entre en rango.
4. Repite para cada insumo de la lista. La barra de progreso arriba muestra cuántos insumos ya
   completaste.

### Entrega parcial

Si no tienes todo el insumo disponible en este momento (por ejemplo, llegó menos mercancía de la
esperada), usa **Registrar entrega parcial** en vez de la confirmación normal:
- Acepta cualquier cantidad mayor a cero que no supere lo pendiente — no exige que esté dentro de
  tolerancia.
- El sistema va acumulando: puedes hacer varias entregas parciales del mismo insumo hasta
  completarlo. Una vez que la suma entra en tolerancia del total requerido, el insumo queda
  marcado como entregado igual que con la confirmación normal.

### Si un insumo se bloquea

Un insumo puede quedar en estado **bloqueado** si el peso entregado se sale demasiado de lo
esperado incluso para un registro parcial. Eso genera una alerta visible para el administrador —
avísale para que revise la orden.

### Productos que no se pesan

Algunos insumos (por ejemplo, empaques o bandejas) no se pesan, se **cuentan**: la pantalla pide
la cantidad en unidades en vez de un peso, y la aprueba si coincide exactamente con lo requerido.

## Cuando termina la orden

Cuando todos los insumos quedan entregados, la orden pasa automáticamente al siguiente estado y
desaparece de tu lista de pendientes — sigue su camino hacia Cocina. No hay ningún botón de
"terminar" que tengas que presionar aparte de completar el último insumo.

## Pantalla completa

Para trabajar sin distracciones (por ejemplo, en una tablet montada junto a la báscula), presiona
**F11** para poner el navegador en pantalla completa.

## Salir

El botón **Salir** arriba a la derecha cierra tu sesión. Si vas a dejar el equipo desatendido, es
buena práctica cerrar sesión — cualquiera con acceso físico al equipo podría entregar insumos en
tu nombre mientras la sesión siga abierta.
