import fastify from 'fastify';
import FastifyJwt from '@fastify/jwt';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AuthController } from './auth/auth.controller';
import { AppController } from './app.controller';
import { TweetsController } from './tweets/tweets.controller';
import { SearchController } from './search/search.controller';
import { logger } from './shared/utils/logger';

/** Construct the app without opening database connections or listening. */
export function createApp() {
  const secret = {
    private: readFileSync(resolve(__dirname, '..', 'private.dev.pem')),
    public: readFileSync(resolve(__dirname, '..', 'public.dev.pem')),
  };
  const app = fastify({
    loggerInstance: logger,
    forceCloseConnections: 'idle',
  });
  app.register(FastifyJwt, { secret });
  app.register(async (instance) => {
    await new AppController(instance).register();
    await new AuthController(instance).register();
    await new TweetsController(instance).register();
    await new SearchController(instance).register();
  });
  return app;
}
