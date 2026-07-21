# Manual de usuario — Cocina

Guía de uso del monitor de cocina (`http://localhost:5173/cocina`). Pensada para una pantalla
fija en la cocina (kiosco oscuro, legible de lejos) que muestra qué se está preparando hoy.

## Entrar

Abre `http://localhost:5173/cocina` e inicia sesión con el usuario de cocina (rol `KITCHEN`). Es
una pantalla de **solo lectura**: cocina consulta la producción del día, pero las decisiones de
avanzar una orden (iniciar preparación, marcar como completada) las toma un administrador desde
el panel de `/admin/produccion`.

## Vista general

La pantalla principal muestra una tarjeta por cada receta que tiene producción programada para
**hoy**, con:
- Total de porciones a preparar (sumando todas las órdenes del día para esa receta).
- Una barra de progreso con el **% de insumos ya entregados** por Bodega.
- "Insumos completos ✓" cuando Bodega ya entregó todo lo que esa receta necesita.

El punto verde "en vivo" indica que la pantalla se actualiza sola conforme Bodega va entregando o
un administrador avanza el estado de una orden — nunca hace falta refrescar el navegador.

## Ver el detalle de una receta

Toca una tarjeta (o espera a que la auto-rotación llegue a ella) para ver:
- **Ingredientes**, ya escalados a la cantidad total de porciones de hoy — no hay que hacer
  cuentas, si el total son 300 porciones el ingrediente ya viene multiplicado.
- **Pasos de preparación** de la receta, en orden.

Presiona **← Volver** o la tecla **Esc** para regresar a la vista general.

## Auto-rotación

El botón **Auto-rotación** (arriba a la derecha) hace que la pantalla vaya pasando sola por cada
receta del día, quedándose el número de segundos que configures en la casilla de al lado antes de
pasar a la siguiente. Pensado para dejar la pantalla funcionando sin que nadie la toque durante el
servicio.

## Pantalla completa

Presiona **F11** para modo kiosco a pantalla completa — recomendado para la pantalla fija de
cocina.

## Tema oscuro

Esta pantalla siempre se ve en tema oscuro (más cómoda para una cocina con poca luz ambiente o
pantallas grandes), independientemente del tema que tengas configurado en el panel de
administración — no hay que cambiar nada, ya viene así por defecto.
