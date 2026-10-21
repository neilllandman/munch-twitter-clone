import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

function port(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
) {
  const value = env[name] === undefined ? String(fallback) : env[name];
  if (
    !/^\d+$/.test(value) ||
    Number(value) < minimum ||
    Number(value) > 65535
  ) {
    throw new Error(
      `Invalid configuration: ${name} must be an integer between ${minimum} and 65535`,
    );
  }
  return Number(value);
}

function text(env: NodeJS.ProcessEnv, name: string, fallback: string) {
  const value = env[name] === undefined ? fallback : env[name].trim();
  if (!value)
    throw new Error(`Invalid configuration: ${name} must not be empty`);
  return value;
}

export function parseEnvironment(env: NodeJS.ProcessEnv) {
  const logLevel = text(env, 'APP_LOG_LEVEL', 'debug');
  if (
    !['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(
      logLevel,
    )
  ) {
    throw new Error(
      'Invalid configuration: APP_LOG_LEVEL is not a supported log level',
    );
  }
  return {
    appHost: text(env, 'APP_HOST', '0.0.0.0'),
    appPort: port(env, 'APP_PORT', 3000, 0),
    logLevel,
    production: env.NODE_ENV === 'production',
    database: {
      host: text(env, 'DB_HOST', 'localhost'),
      port: port(env, 'DB_PORT', 5432, 1),
      username: text(env, 'DB_USERNAME', 'postgres'),
      password: env.DB_PASSWORD ?? 'postgres',
      database: text(env, 'DB_NAME', 'twitter_clone'),
    },
  };
}

export function loadEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  file = resolve('.env'),
) {
  dotenvConfig({ path: file, processEnv: env });
  return parseEnvironment(env);
}

export const environment = loadEnvironment();
