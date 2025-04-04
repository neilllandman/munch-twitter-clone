import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ControllerInterface } from '../shared/interfaces/controller.interface';
import { authMiddleware } from '../auth/auth.middleware';
import { JwtToken } from '../auth/dtos/jwt-token';
import { TaggedUser, Tweet } from '../database/models';
import { createTweetRouteOpts } from './route-options';
import { User } from '../database/models';

import { logger } from '../shared/utils/logger';
import { Op } from 'sequelize';

export class TweetsController implements ControllerInterface {
  constructor(private readonly app: FastifyInstance) {
    // Constructor logic here
  }

  async myFeed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token: JwtToken = request.user as JwtToken;
    const id = token.sub;

    const tweets = await Tweet.findAll({
      where: {
        [Op.or]: [{ userId: id }, { [`$taggedUsers.userId$`]: id }],
      },
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: TaggedUser, as: 'taggedUsers', attributes: [] },
      ],
    });
    reply.send(tweets);
  }

  async getAllTweets(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Use id to order: Results will be the same as using createdAt
    // since it's auto incrementing, but more efficient
    const tweets = await Tweet.findAll({
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
    reply.send(tweets);
  }

  async getUserTweets(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.params.id;

    const tweets = await Tweet.findAll({
      where: { userId },
      attributes: ['id', 'content', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']],
      include: [TaggedUser],
    });
    reply.send(tweets);
  }

  async createTweet(
    request: FastifyRequest<{ Body: { content: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const token: JwtToken = request.user as JwtToken;
    const userId = token.sub;

    const { content } = request.body;

    const transaction = await Tweet.sequelize.transaction();

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
      return reply.status(201).send(tweet);
    } catch (error) {
      await transaction.rollback();
      logger.error(`Error creating tweet: ${error}`);
      return reply.status(500).send({
        error: 'Internal server error',
      });
    }
  }

  async register() {
    this.app.get(
      '/users/:id/tweets',
      { preValidation: authMiddleware },
      this.getUserTweets.bind(this),
    );
    this.app.get(
      '/my-feed',
      { preValidation: authMiddleware },
      this.myFeed.bind(this),
    );
    this.app.get(
      '/tweets',
      { preValidation: authMiddleware },
      this.getAllTweets.bind(this),
    );
    this.app.post(
      '/tweets',
      { preValidation: authMiddleware, ...createTweetRouteOpts },
      this.createTweet.bind(this),
    );
  }
}
