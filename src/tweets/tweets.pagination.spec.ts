import fastify, { FastifyInstance } from 'fastify';
import FastifyJwt from '@fastify/jwt';
import { TweetsController } from './tweets.controller';
import { TweetsService } from './tweets.service';

jest.mock('./tweets.service');

describe('tweet pagination routes', () => {
  let app: FastifyInstance;
  let authorization: string;
  let service: jest.Mocked<TweetsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = fastify();
    await app.register(FastifyJwt, { secret: 'pagination-test-secret' });
    const controller = new TweetsController(app);
    service = (controller as any).tweetsService;
    service.getAllTweets.mockResolvedValue([]);
    service.getUserTweets.mockResolvedValue([]);
    service.getFeed.mockResolvedValue([]);
    await controller.register();
    authorization = `Bearer ${app.jwt.sign({ sub: 1 })}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['/tweets', '/users/1/tweets', '/my-feed'])(
    'defaults and validates pagination for %s',
    async (url) => {
      const send = (query = '') =>
        app.inject({ url: `${url}${query}`, headers: { authorization } });
      const response = await send();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
      const handler =
        url === '/tweets'
          ? service.getAllTweets
          : url === '/my-feed'
            ? service.getFeed
            : service.getUserTweets;
      const lastRequest = () => {
        const calls = handler.mock.calls as any[][];
        const args = calls[calls.length - 1];
        return args[args.length - 1];
      };
      expect(lastRequest().query).toEqual({ limit: 25 });

      expect((await send('?beforeId=76&limit=100')).statusCode).toBe(200);
      expect(lastRequest().query).toEqual({ beforeId: 76, limit: 100 });

      for (const query of [
        '?limit=0',
        '?limit=101',
        '?limit=1.5',
        '?limit=abc',
        '?beforeId=0',
        '?beforeId=-1',
        '?beforeId=1.5',
        '?beforeId=abc',
        '?beforeId=2147483648',
      ]) {
        expect((await send(query)).statusCode).toBe(400);
      }
      expect(handler).toHaveBeenCalledTimes(2);
    },
  );
});
