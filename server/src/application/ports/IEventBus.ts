import type { EventName, ServerToClientEvents } from '@gaby/shared';

/** Payload tipado de un evento del catálogo compartido. */
export type EventPayload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

/**
 * Puerto de eventos (AD-05): los casos de uso publican hechos de negocio
 * sin conocer Socket.IO. Regla: publicar SIEMPRE después del commit de la
 * transacción — nunca notificar algo que pudo hacer rollback.
 */
export interface IEventBus {
  publish<E extends EventName>(event: E, payload: EventPayload<E>, rooms: string[]): void;
}
