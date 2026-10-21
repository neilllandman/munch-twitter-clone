import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadEnvironment, parseEnvironment } from './environment';

describe('configuration', () => {
  it('preserves local defaults and allows an ephemeral HTTP port', () => {
    expect(parseEnvironment({})).toEqual({
      appHost: '0.0.0.0',
      appPort: 3000,
      logLevel: 'debug',
      production: false,
      database: {
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgres',
        database: 'twitter_clone',
      },
    });
    expect(parseEnvironment({ APP_PORT: '0' }).appPort).toBe(0);
    expect(parseEnvironment({ NODE_ENV: 'production' }).production).toBe(true);
  });

  it.each([
    ['APP_PORT', '-1'],
    ['APP_PORT', '65536'],
    ['APP_PORT', '1.5'],
    ['APP_PORT', ''],
    ['DB_PORT', '0'],
    ['DB_PORT', 'abc'],
    ['DB_PORT', '1e3'],
    ['APP_HOST', ' '],
    ['DB_HOST', ''],
    ['DB_USERNAME', ''],
    ['DB_NAME', ' '],
    ['APP_LOG_LEVEL', 'verbose'],
  ])('rejects invalid %s without exposing credentials', (name, value) => {
    const env = { [name]: value, DB_PASSWORD: 'private-password' };
    expect(() => parseEnvironment(env)).toThrow(name);
    try {
      parseEnvironment(env);
    } catch (error) {
      expect(error.message).not.toContain('private-password');
    }
  });

  it('loads .env before parsing, preserving explicitly supplied environment values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'munch-env-test-'));
    try {
      const file = join(directory, '.env');
      writeFileSync(
        file,
        'DB_HOST=file-host\nDB_PORT=55432\nAPP_LOG_LEVEL=warn\nAPP_PORT=4000\n',
      );
      const config = loadEnvironment({ APP_PORT: '0' }, file);
      expect(config.database.host).toBe('file-host');
      expect(config.database.port).toBe(55432);
      expect(config.logLevel).toBe('warn');
      expect(config.appPort).toBe(0);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
