import { literal, Op } from 'sequelize';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { TaggedUser, Tweet, User } from '../database/models';
import { logger } from '../shared/utils/logger';
import { extractMentionedUsernames } from '../shared/utils/mentions';
import { TweetQuery } from './dtos/tweet-query';

export class TweetsService {
  /**
   * Returns the tweets of a specific user.
   */
  async getUserTweets(
    userId: number,
    request: FastifyRequest<{
      Params: { id: number };
      Querystring: TweetQuery;
    }>,
  ) {
    const { beforeId, limit = 25 } = request.query ?? {};
    return Tweet.findAll({
      where: { userId, ...(beforeId ? { id: { [Op.lt]: beforeId } } : {}) },
      limit,
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      order: [['id', 'DESC']],
      include: [{ model: TaggedUser, as: 'taggedUsers', separate: true }],
    });
  }

  /**
   * Returns all tweets in the database.
   */
  async getAllTweets(request: FastifyRequest<{ Querystring: TweetQuery }>) {
    const { beforeId, limit = 25 } = request.query ?? {};
    return Tweet.findAll({
      where: beforeId ? { id: { [Op.lt]: beforeId } } : {},
      limit,
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
  }
  /**
   * Returns the tweets of the currently authenticated user including the
   * tweets of the users where the authenticated user was tagged in.
   */
  async getFeed(
    id: number,
    request: FastifyRequest<{ Querystring: TweetQuery }>,
  ) {
    const { beforeId, limit = 25 } = request.query ?? {};
    return Tweet.findAll({
      where: {
        ...(beforeId ? { id: { [Op.lt]: beforeId } } : {}),
        [Op.or]: [
          { userId: id },
          literal(`EXISTS (
            SELECT 1 FROM "tagged_users" AS "mention"
            WHERE "mention"."tweetId" = "Tweet"."id"
              AND "mention"."userId" = $feedUserId
          )`),
        ],
      },
      bind: { feedUserId: id },
      limit,
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      order: [['id', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
      ],
    });
  }
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Creates a new tweet in the database and tags users if they are mentioned
   */
  async createTweet(data: { content: string; userId: number }): Promise<Tweet> {
    // Need to use a transaction to ensure that the tweet is created
    // and the tagged users are created in the same transaction.
    const transaction = await Tweet.sequelize.transaction();

    const { content, userId } = data;
    try {
      const tweet = await Tweet.create(
        {
          userId: userId,
          content,
        },
        { transaction },
      );

      const usernames = extractMentionedUsernames(content);

      if (usernames.length > 0) {
        const users = await User.findAll({
          where: {
            id: {
              [Op.ne]: userId,
            },
            username: usernames,
          },
          attributes: ['id'],
          transaction,
        });

        if (users.length > 0) {
          const taggedUsers = users.map((user) => ({
            userId: user.id,
            tweetId: tweet.id,
          }));
          await TaggedUser.bulkCreate(taggedUsers, { transaction });
        }
      }

      await transaction.commit();
      return tweet;
    } catch (error) {
      await transaction.rollback();
      logger.error(`Error creating tweet: ${error}`);
      throw error;
    }
  }
}
