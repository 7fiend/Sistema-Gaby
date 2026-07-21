import { pino } from 'pino';
import { isDev } from '../../config/env.js';

/** Logger estructurado único (AD-11). En desarrollo: salida legible. */
export const logger = pino({
  level: isDev ? 'debug' : 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
});
