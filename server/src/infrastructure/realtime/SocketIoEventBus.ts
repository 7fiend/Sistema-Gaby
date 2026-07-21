import type { EventName } from '@gaby/shared';
import type { EventPayload, IEventBus } from '../../application/ports/IEventBus.js';
import { logger } from '../logging/logger.js';
import type { createRealtimeServer } from './socket.js';

type RealtimeNamespace = ReturnType<typeof createRealtimeServer>['realtime'];

export class SocketIoEventBus implements IEventBus {
  constructor(private readonly realtime: RealtimeNamespace) {}

  publish<E extends EventName>(event: E, payload: EventPayload<E>, rooms: string[]): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.realtime.to(rooms).emit(event, payload as any);
    logger.debug({ event, rooms }, 'Evento publicado');
  }
}
