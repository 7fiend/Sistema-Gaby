import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { SOCKET_ROOMS, type AuthUser, type ServerToClientEvents } from '@gaby/shared';
import type { ITokenService } from '../../application/ports/ITokenService.js';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';

export type RealtimeServer = Server<Record<string, never>, ServerToClientEvents>;

/** Salas según rol: qué pantallas deben enterarse de qué (Fase 2 §5). */
function roomsForRole(role: string): string[] {
  switch (role) {
    case 'ADMIN':
    case 'AUDITOR':
      // Supervisión total: reciben también lo que ven bodega y cocina
      return [SOCKET_ROOMS.ADMIN, SOCKET_ROOMS.INVENTORY, SOCKET_ROOMS.KITCHEN];
    case 'INVENTORY':
      return [SOCKET_ROOMS.INVENTORY];
    case 'KITCHEN':
      return [SOCKET_ROOMS.KITCHEN];
    default:
      return [];
  }
}

/**
 * Namespace /realtime autenticado con el MISMO JWT de la API (AD-05).
 * El cliente jamás emite eventos de negocio (ClientToServerEvents = {}):
 * toda mutación entra por REST.
 *
 * IMPORTANTE: se crea SIN adjuntar al httpServer. El attach() ocurre en
 * main.ts DESPUÉS de montar Express — si Socket.IO se adjunta antes,
 * ambos responden las peticiones de polling (ERR_HTTP_HEADERS_SENT).
 */
export function createRealtimeServer(tokens: ITokenService) {
  const io = new Server({
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  const realtime = io.of('/realtime');

  realtime.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      const user = tokens.verifyAccessToken(token);
      (socket.data as { user: AuthUser }).user = user;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  realtime.on('connection', (socket) => {
    const user = (socket.data as { user: AuthUser }).user;
    const rooms = roomsForRole(user.role);
    void socket.join(rooms);
    logger.debug({ user: user.username, rooms }, 'Socket conectado');

    socket.on('disconnect', (reason) => {
      logger.debug({ user: user.username, reason }, 'Socket desconectado');
    });
  });

  return {
    realtime,
    attach: (httpServer: HttpServer) => io.attach(httpServer),
  };
}
