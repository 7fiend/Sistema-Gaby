import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/prisma.js';
import { JwtTokenService } from './infrastructure/auth/JwtTokenService.js';
import { createRealtimeServer } from './infrastructure/realtime/socket.js';
import { SocketIoEventBus } from './infrastructure/realtime/SocketIoEventBus.js';
import { buildContainer } from './container.js';
import { createApp } from './app.js';
import { startExpiryCron } from './infrastructure/jobs/expiry-cron.js';
import { startBackupCron } from './infrastructure/jobs/backup-cron.js';

async function main(): Promise<void> {
  await connectDatabase();

  // Orden de composición: Socket.IO (sin adjuntar) → EventBus → contenedor
  // → Express → httpServer → attach. Socket.IO debe adjuntarse DESPUÉS de
  // Express para interceptar sus propias peticiones (ver socket.ts).
  const tokens = new JwtTokenService();
  const { realtime, attach } = createRealtimeServer(tokens);
  const eventBus = new SocketIoEventBus(realtime);

  const container = buildContainer({ eventBus, tokens });
  const app = createApp(container);
  const httpServer = createServer(app);
  attach(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`API escuchando en http://localhost:${env.PORT}/api/v1 (+ /realtime)`);
  });

  // Cron de vencimientos (9c): corre al arrancar y a diario a las 6:00
  startExpiryCron(container.expiryAlerts);

  // Cron de respaldos (13): horario configurable en Configuración → Respaldos
  const { backupSchedule } = await container.settings.get();
  startBackupCron(container.backups, backupSchedule);

  const shutdown = async (signal: string) => {
    logger.info(`${signal} recibido, cerrando…`);
    httpServer.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal(err, 'Error fatal al arrancar');
  process.exit(1);
});
