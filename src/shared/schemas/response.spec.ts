import fastify, { FastifyInstance } from 'fastify';
import FastifyJwt from '@fastify/jwt';
import { AppController } from '../../app.controller';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { TweetsController } from '../../tweets/tweets.controller';
import { TweetsService } from '../../tweets/tweets.service';
import { Tweet, User } from '../../database/models';

jest.mock('../../auth/auth.service');
jest.mock('../../tweets/tweets.service');
jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true) }));

const date = new Date('2026-10-20T12:00:00.000Z');
const timestamps = { createdAt: date, updatedAt: date };
const serializedTimestamps = {
  createdAt: date.toISOString(),
  updatedAt: date.toISOString(),
};
const profile = { id: 1, email: 'alice@example.org', username: 'alice' };
const safeUser = { ...profile, ...serializedTimestamps };
const user = {
  ...profile,
  ...timestamps,
  password: 'secret',
  internal: 'hidden',
};
const tweet = { id: 2, content: 'Hello @bob', ...timestamps };
const safeTweet = { id: 2, content: tweet.content, ...serializedTimestamps };

describe('response serialization', () => {
  let app: FastifyInstance;
  let authorization: string;
  let auth: jest.Mocked<AuthService>;
  let tweets: jest.Mocked<TweetsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = fastify();
    await app.register(FastifyJwt, { secret: 'response-schema-test-secret' });
    const authController = new AuthController(app);
    auth = authController.authService as jest.Mocked<AuthService>;
    const tweetsController = new TweetsController(app);
    tweets = (tweetsController as any).tweetsService;
    await new AppController(app).register();
    await authController.register();
    await tweetsController.register();
    authorization = `Bearer ${app.jwt.sign({ sub: 1 })}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('serializes the health response', async () => {
    const response = await app.inject({ url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it.each(['/auth/register', '/auth/login'])(
    'filters passwords and extra fields from %s',
    async (url) => {
      auth.getUserFromCredentials.mockResolvedValue(
        url.endsWith('login') ? User.build(user) : null,
      );
      auth.registerUser.mockResolvedValue(User.build(user));
      auth.buildAuthResponse.mockReturnValue({
        token: 'test-token',
        user,
        internal: 'hidden',
      } as any);
      const response = await app.inject({
        method: 'POST',
        url,
        payload: {
          username: 'alice',
          email: 'alice@example.org',
          password: 'password123',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ token: 'test-token', user: safeUser });
    },
  );

  it('allows omitted login timestamps without inventing values', async () => {
    auth.getUserFromCredentials.mockResolvedValue(User.build(user));
    auth.buildAuthResponse.mockReturnValue({
      token: 'test-token',
      user: profile,
    } as any);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'alice', password: 'password123' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ token: 'test-token', user: profile });
  });

  it('serializes Sequelize user instances without exposing password fields', async () => {
    auth.getAuthenticatedUser.mockResolvedValue(User.build(user));
    const response = await app.inject({
      url: '/auth/user',
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(safeUser);
  });

  it('preserves a null result for a user that no longer exists', async () => {
    auth.getAuthenticatedUser.mockResolvedValue(null);
    const response = await app.inject({
      url: '/auth/user',
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });

  it.each(['/tweets', '/my-feed'])(
    'serializes %s with nested authors and no undeclared fields',
    async (url) => {
      const result = [{ ...tweet, user, internal: 'hidden' }] as any;
      tweets.getAllTweets.mockResolvedValue(result);
      tweets.getFeed.mockResolvedValue(result);
      const response = await app.inject({ url, headers: { authorization } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([{ ...safeTweet, user: profile }]);
    },
  );

  it('preserves user timeline mention details and filters extra fields', async () => {
    const mention = {
      id: 3,
      userId: 4,
      tweetId: 2,
      ...timestamps,
      internal: 'hidden',
    };
    tweets.getUserTweets.mockResolvedValue([
      { ...tweet, taggedUsers: [mention], internal: 'hidden' },
    ] as any);
    const response = await app.inject({
      url: '/users/1/tweets',
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        ...safeTweet,
        taggedUsers: [
          { id: 3, userId: 4, tweetId: 2, ...serializedTimestamps },
        ],
      },
    ]);
  });

  it('serializes a created Sequelize tweet with its author ID', async () => {
    tweets.createTweet.mockResolvedValue(Tweet.build({ ...tweet, userId: 1 }));
    const response = await app.inject({
      method: 'POST',
      url: '/tweets',
      headers: { authorization },
      payload: { content: tweet.content },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ...safeTweet, userId: 1 });
  });

  it('preserves application and framework error response shapes', async () => {
    const unauthorized = await app.inject({ url: '/tweets' });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toEqual({ error: 'Unauthorized' });

    const invalid = await app.inject({
      url: '/tweets?limit=101',
      headers: { authorization },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: expect.any(String),
    });

    tweets.getAllTweets.mockRejectedValue(new Error('database unavailable'));
    const failed = await app.inject({
      url: '/tweets',
      headers: { authorization },
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.json()).toEqual({ error: 'Internal server error' });
  });

  it('rejects a malformed success payload rather than returning incomplete data', async () => {
    tweets.getAllTweets.mockResolvedValue([{ id: 2 }] as Tweet[]);
    const response = await app.inject({
      url: '/tweets',
      headers: { authorization },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toBe('Internal Server Error');
  });
});
