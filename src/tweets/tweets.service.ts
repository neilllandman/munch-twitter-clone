import { Op } from 'sequelize';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { TaggedUser, Tweet, User } from '../database/models';
import { logger } from '../shared/utils/logger';

export class TweetsService {
  /**
   * Returns the tweets of a specific user.
   */
  async getUserTweets(
    userId: number,
    _request: FastifyRequest<{ Params: { id: number } }>,
  ) {
    return Tweet.findAll({
      where: { userId },
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      order: [['id', 'DESC']],
      include: [TaggedUser],
    });
  }

  /**
   * Returns all tweets in the database.
   */
  async getAllTweets(_request: FastifyRequest) {
    // TODO: consider using request.query to paginate the results
    return Tweet.findAll({
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
  async getFeed(id: number, _request: FastifyRequest) {
    // TODO: consider using request.query to paginate the results

    // Use id to order: Results will be the same as using
    // createdAt since it is an auto incrementing field,
    // but more efficient. Empty array for taggedUsers
    // attributes since we don't need them attached.
    return Tweet.findAll({
      where: {
        [Op.or]: [{ userId: id }, { [`$taggedUsers.userId$`]: id }],
      },
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      order: [['id', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: TaggedUser, as: 'taggedUsers', attributes: [] },
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

      const tags = content.split(' ').filter((word) => word.startsWith('@'));

      if (tags.length > 0) {
        const users = await User.findAll({
          where: {
            id: {
              [Op.ne]: userId,
            },
            username: tags.map((tag) => tag.substring(1)),
          },
          attributes: ['id'],
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
