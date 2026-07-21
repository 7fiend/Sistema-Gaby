import { PrismaClient } from '@prisma/client';
import { isDev } from '../../config/env.js';
import { logger } from '../logging/logger.js';

/** Cliente Prisma único (la URL viene de DATABASE_URL — AD-04). */
export const prisma = new PrismaClient({
  log: isDev ? ['warn', 'error'] : ['error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Base de datos conectada');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
