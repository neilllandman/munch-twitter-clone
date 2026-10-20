import fastify, { FastifyInstance } from 'fastify';
import FastifyJwt from '@fastify/jwt';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

jest.mock('./search.service');

describe('search routes', () => {
  let app: FastifyInstance;
  let service: jest.Mocked<SearchService>;
  let authorization: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = fastify();
    await app.register(FastifyJwt, { secret: 'search-test-secret' });
    const controller = new SearchController(app);
    service = (controller as any).searchService;
    service.searchTweets.mockResolvedValue([]);
    service.searchUsers.mockResolvedValue([]);
    await controller.register();
    authorization = `Bearer ${app.jwt.sign({ sub: 1 })}`;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it.each(['/search/tweets', '/search/users'])(
    'validates %s before performing a database search',
    async (path) => {
      const handler = path.endsWith('tweets')
        ? service.searchTweets
        : service.searchUsers;
      for (const query of [
        '',
        '?q=',
        '?q=%20%09%0A',
        `?q=${'a'.repeat(101)}`,
        '?q=hello&limit=0',
        '?q=hello&limit=101',
        '?q=hello&limit=1.5',
        '?q=hello&beforeId=0',
        '?q=hello&beforeId=1.5',
        '?q=hello&beforeId=2147483648',
      ]) {
        const response = await app.inject({
          url: `${path}${query}`,
          headers: { authorization },
        });
        expect(response.statusCode).toBe(400);
      }
      expect(handler).not.toHaveBeenCalled();

      const response = await app.inject({
        url: `${path}?q=hello`,
        headers: { authorization },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
      expect(handler).toHaveBeenCalledWith({ q: 'hello', limit: 25 });

      const next = await app.inject({
        url: `${path}?q=hello&beforeId=50&limit=100`,
        headers: { authorization },
      });
      expect(next.statusCode).toBe(200);
      expect(handler).toHaveBeenLastCalledWith({
        q: 'hello',
        beforeId: 50,
        limit: 100,
      });
    },
  );

  it.each(['/search/tweets', '/search/users'])(
    'requires authentication for %s',
    async (path) => {
      for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
        const response = await app.inject({ url: `${path}?q=hello`, headers });
        expect(response.statusCode).toBe(401);
      }
      expect(service.searchTweets).not.toHaveBeenCalled();
      expect(service.searchUsers).not.toHaveBeenCalled();
    },
  );

  it('exposes only user IDs and usernames', async () => {
    service.searchUsers.mockResolvedValue([
      {
        id: 1,
        username: 'alice',
        email: 'private@example.org',
        password: 'secret',
      },
    ] as any);
    const response = await app.inject({
      url: '/search/users?q=ali',
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 1, username: 'alice' }]);
  });

  it('preserves the existing tweet-list response shape', async () => {
    const timestamp = '2026-10-20T12:00:00.000Z';
    service.searchTweets.mockResolvedValue([
      {
        id: 1,
        content: 'Hello',
        createdAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
        internal: 'hidden',
        user: {
          id: 2,
          username: 'alice',
          email: 'alice@example.org',
          password: 'secret',
        },
      },
    ] as any);
    const response = await app.inject({
      url: '/search/tweets?q=hello',
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 1,
        content: 'Hello',
        createdAt: timestamp,
        updatedAt: timestamp,
        user: { id: 2, username: 'alice', email: 'alice@example.org' },
      },
    ]);
  });

  it.each(['/search/tweets', '/search/users'])(
    'uses the standard error response for failed %s searches',
    async (path) => {
      service.searchTweets.mockRejectedValue(new Error('database unavailable'));
      service.searchUsers.mockRejectedValue(new Error('database unavailable'));
      const response = await app.inject({
        url: `${path}?q=hello`,
        headers: { authorization },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal server error' });
    },
  );
});
