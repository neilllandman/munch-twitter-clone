import { TweetsController } from './tweets.controller';
import { TweetsService } from './tweets.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtToken } from '../auth/dtos/jwt-token';
import { Tweet } from '../database/models';

// filepath: src/tweets/tweets.controller.test.ts

jest.mock('./tweets.service');

describe('TweetsController', () => {
  let tweetsController: TweetsController;
  let tweetsService: jest.Mocked<TweetsService>;
  let mockReply: jest.Mocked<FastifyReply>;

  beforeEach(() => {
    tweetsService = new TweetsService({} as any) as jest.Mocked<TweetsService>;
    tweetsController = new TweetsController({} as any);
    (tweetsController as any).tweetsService = tweetsService;

    mockReply = {
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as any;
  });

  describe('myFeed', () => {
    it('should return the user feed', async () => {
      const mockRequest = {
        user: { sub: 1 } as JwtToken,
      } as FastifyRequest;
      const mockFeed = [{ id: 1, content: 'Hello World' }] as Tweet[];
      tweetsService.getFeed.mockResolvedValue(mockFeed);

      await tweetsController.myFeed(mockRequest, mockReply);

      expect(tweetsService.getFeed).toHaveBeenCalledWith(1, mockRequest);
      expect(mockReply.send).toHaveBeenCalledWith(mockFeed);
    });
  });

  describe('getAllTweets', () => {
    it('should return all tweets', async () => {
      const mockRequest = {} as FastifyRequest;
      const mockTweets = [{ id: 1, content: 'Hello World' }];
      tweetsService.getAllTweets.mockResolvedValue(mockTweets as Tweet[]);

      await tweetsController.getAllTweets(mockRequest, mockReply);

      expect(tweetsService.getAllTweets).toHaveBeenCalledWith(mockRequest);
      expect(mockReply.send).toHaveBeenCalledWith(mockTweets);
    });
  });

  describe('createTweet', () => {
    it('should create a tweet successfully', async () => {
      const mockRequest = {
        user: { sub: 1 } as JwtToken,
        body: { content: 'Hello World' },
      } as FastifyRequest<{ Body: { content: string } }>;
      const mockTweet = { id: 1, content: 'Hello World', userId: 1 } as Tweet;
      tweetsService.createTweet.mockResolvedValue(mockTweet);

      await tweetsController.createTweet(mockRequest, mockReply);

      expect(tweetsService.createTweet).toHaveBeenCalledWith({
        content: 'Hello World',
        userId: 1,
      });
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(mockTweet);
    });

    it('should handle errors during tweet creation', async () => {
      const mockRequest = {
        user: { sub: 1 } as JwtToken,
        body: { content: 'Hello World' },
      } as FastifyRequest<{ Body: { content: string } }>;
      tweetsService.createTweet.mockRejectedValue(new Error('Database error'));

      await tweetsController.createTweet(mockRequest, mockReply);

      expect(tweetsService.createTweet).toHaveBeenCalledWith({
        content: 'Hello World',
        userId: 1,
      });
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });
  });
});
