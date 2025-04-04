// import FastifyFormBody from '@fastify/formbody';
// import FastifyMultiPart from '@fastify/multipart';
// import fastifyStatic from '@fastify/static';
import { config as dotenvConfig } from 'dotenv';
import fastify, { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import FastifyJwt from '@fastify/jwt';
import { logger } from './shared/utils/logger';
import { AuthController } from './auth/auth.controller';
import { sequelize } from './database/connection';
import { AppController } from './app.controller';

// Load environment variables from .env file
dotenvConfig({ path: '.env' });

export async function bootstrap() {
  const app: FastifyInstance = fastify({
    logger: true,
  });

  app.register(FastifyJwt, {
    // For production, use AWS secrets manager or similar to store secrets
    // and load them at runtime
    secret: {
      private: readFileSync(resolvePath(__dirname, '..', 'private.dev.pem')),
      public: readFileSync(resolvePath(__dirname, '..', 'public.dev.pem')),
    },
  });

  // connect to the database
  await sequelize.authenticate();

  // register routes
  await new AppController(app).register();
  await new AuthController(app).register();

  // start server
  try {
    await app.listen({
      port: Number(process.env.APP_PORT) || 3000,
      host: process.env.APP_HOST || '0.0.0.0',
    });
    logger.info(app.printRoutes());
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

process.on('exit', (exitCode: number) => {
  if (exitCode !== 0) {
    logger.error(`program exited with error code ${exitCode}`);
  }
});

process.on('SIGINT', () => {
  logger.debug(`Received SIGINT.`);
  process.exit(0);
});

bootstrap();
