import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ControllerInterface } from '../shared/interfaces/controller.interface';
import { authMiddleware } from '../auth/auth.middleware';
import { JwtToken } from '../auth/dtos/jwt-token';
import { createTweetRouteOpts } from './route-options';

import { logger } from '../shared/utils/logger';
import { TweetsService } from './tweets.service';

export class TweetsController implements ControllerInterface {
  private readonly tweetsService: TweetsService;

  constructor(private readonly app: FastifyInstance) {
    this.tweetsService = new TweetsService(app);
  }

  /**
   * Returns the tweets of the currently authenticated user including the
   * tweets of the users where the authenticated user was tagged in.
   */
  async myFeed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token: JwtToken = request.user as JwtToken;
    const id = token.sub;

    const tweets = await this.tweetsService.getFeed(id, request);
    reply.send(tweets);
  }

  /**
   * Returns all tweets in the database.
   */
  async getAllTweets(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const tweets = await this.tweetsService.getAllTweets(request);
      reply.send(tweets);
    } catch (error) {
      logger.error(`Error fetching all tweets: ${error}`);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  }

  /**
   * Get tweets of a specific user.
   */
  async getUserTweets(
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.params.id;

    try {
      const tweets = await this.tweetsService.getUserTweets(userId, request);
      reply.send(tweets);
    } catch (error) {
      logger.error(`Error fetching user tweets: ${error}`);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  }

  /**
   * Handles the creation of a new tweet.
   *
   * Creates a new tweet. If the tweet content contains mentions (words starting with '@'),
   * it identifies the mentioned users and associates them with the tweet.
   */
  async createTweet(
    request: FastifyRequest<{ Body: { content: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const token: JwtToken = request.user as JwtToken;
    const userId = token.sub;

    const { content } = request.body;

    // Start database transaction

    try {
      const tweet = await this.tweetsService.createTweet({
        content,
        userId,
      });

      return reply.status(201).send(tweet);
    } catch (error) {
      logger.error(`Error creating tweet: ${error}`);
      return reply.status(500).send({
        error: 'Internal server error',
      });
    }
  }

  /**
   * Registers the routes for the tweets module.
   *
   * This method sets up the following routes:
   * - `GET /users/:id/tweets`: Retrieves tweets for a specific user. Requires authentication.
   * - `GET /my-feed`: Retrieves the authenticated user's feed. Requires authentication.
   * - `GET /tweets`: Retrieves all tweets. Requires authentication.
   * - `POST /tweets`: Creates a new tweet. Requires authentication and adheres to the options defined in `createTweetRouteOpts`.
   *
   * Each route uses the `authMiddleware` for pre-validation to ensure that the user is authenticated.
   */
  async register() {
    // Need to use `bind` to ensure `this` context is correct
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
