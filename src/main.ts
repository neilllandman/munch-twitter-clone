import { createApp } from './app';
import { environment } from './config/environment';
import { sequelize } from './database/connection';
import { ApplicationLifecycle } from './lifecycle';
import { logger } from './shared/utils/logger';

export function bootstrap() {
  const lifecycle = new ApplicationLifecycle({
    createApp,
    database: sequelize,
    config: environment,
    logger,
    setExitCode: (code) => {
      process.exitCode = code;
    },
    forceExit: (code) => process.exit(code),
  });
  const shutdown = () => {
    void lifecycle.stop();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return { lifecycle, started: lifecycle.start() };
}

if (require.main === module) bootstrap();
