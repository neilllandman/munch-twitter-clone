import pino from 'pino';
import { environment } from '../../config/environment';

export const logger = pino({
  level: environment.logLevel,
});
