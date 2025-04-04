import { TweetsService } from './tweets.service';
import { Tweet, User, TaggedUser } from '../database/models';
import { Op } from 'sequelize';

jest.mock('../database/models');

describe('TweetsService', () => {
  let tweetsService: TweetsService;

  beforeEach(() => {
    tweetsService = new TweetsService({} as any); // Mock FastifyInstance
  });

  describe('getAllTweets', () => {
    it('should return all tweets with user details', async () => {
      const mockTweets = [
        {
          id: 1,
          content: 'Hello World',
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 1, username: 'testuser', email: 'test@example.com' },
        },
      ];
      (Tweet.findAll as jest.Mock).mockResolvedValue(mockTweets);

      const result = await tweetsService.getAllTweets({} as any);

      expect(Tweet.findAll).toHaveBeenCalledWith({
        attributes: ['id', 'content', 'createdAt', 'updatedAt'],
        order: [['id', 'DESC']],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'email'],
          },
        ],
      });
      expect(result).toEqual(mockTweets);
    });
  });

  describe('getFeed', () => {
    it('should return the feed for a user', async () => {
      const mockFeed = [
        {
          id: 1,
          content: 'Hello World',
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 1, username: 'testuser', email: 'test@example.com' },
        },
      ];
      (Tweet.findAll as jest.Mock).mockResolvedValue(mockFeed);

      const result = await tweetsService.getFeed(1, {} as any);

      expect(Tweet.findAll).toHaveBeenCalledWith({
        where: {
          [Op.or]: [{ userId: 1 }, { [`$taggedUsers.userId$`]: 1 }],
        },
        attributes: ['id', 'content', 'createdAt', 'updatedAt'],
        order: [['id', 'DESC']],
        include: [
          { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
          { model: TaggedUser, as: 'taggedUsers', attributes: [] },
        ],
      });
      expect(result).toEqual(mockFeed);
    });
  });

  describe('createTweet', () => {
    it('should create a tweet and tag users', async () => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };
      const mockTweet = { id: 1, content: 'Hello @user', userId: 1 };
      const mockUsers = [{ id: 2, username: 'user' }];
      const mockTaggedUsers = [{ userId: 2, tweetId: 1 }];

      (Tweet.sequelize.transaction as jest.Mock).mockResolvedValue(
        mockTransaction,
      );
      (Tweet.create as jest.Mock).mockResolvedValue(mockTweet);
      (User.findAll as jest.Mock).mockResolvedValue(mockUsers);
      (TaggedUser.bulkCreate as jest.Mock).mockResolvedValue(mockTaggedUsers);

      const result = await tweetsService.createTweet({
        content: 'Hello @user',
        userId: 1,
      });

      expect(Tweet.sequelize.transaction).toHaveBeenCalled();
      expect(Tweet.create).toHaveBeenCalledWith(
        { userId: 1, content: 'Hello @user' },
        { transaction: mockTransaction },
      );
      expect(User.findAll).toHaveBeenCalledWith({
        where: {
          id: { [Op.ne]: 1 },
          username: ['user'],
        },
        attributes: ['id'],
      });
      expect(TaggedUser.bulkCreate).toHaveBeenCalledWith(mockTaggedUsers, {
        transaction: mockTransaction,
      });
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(result).toEqual(mockTweet);
    });

    it('should rollback transaction on error', async () => {
      const mockTransaction = {
        commit: jest.fn(),
        rollback: jest.fn(),
      };

      (Tweet.sequelize.transaction as jest.Mock).mockResolvedValue(
        mockTransaction,
      );
      (Tweet.create as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        tweetsService.createTweet({ content: 'Hello @user', userId: 1 }),
      ).rejects.toThrow('Database error');

      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });
});
