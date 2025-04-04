import pino from 'pino';

export const logger = pino({
  level: process.env.APP_LOG_LEVEL || 'debug',
});
