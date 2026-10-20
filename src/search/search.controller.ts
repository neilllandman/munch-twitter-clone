import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth.middleware';
import { ControllerInterface } from '../shared/interfaces/controller.interface';
import { logger } from '../shared/utils/logger';
import { SearchQuery } from './dtos/search-query';
import { searchTweetsRouteOpts, searchUsersRouteOpts } from './route-options';
import { SearchService } from './search.service';

export class SearchController implements ControllerInterface {
  private readonly searchService = new SearchService();

  constructor(private readonly app: FastifyInstance) {}

  async searchTweets(
    request: FastifyRequest<{ Querystring: SearchQuery }>,
    reply: FastifyReply,
  ) {
    try {
      return reply.send(await this.searchService.searchTweets(request.query));
    } catch (error) {
      logger.error({ err: error }, 'Error searching tweets');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }

  async searchUsers(
    request: FastifyRequest<{ Querystring: SearchQuery }>,
    reply: FastifyReply,
  ) {
    try {
      return reply.send(await this.searchService.searchUsers(request.query));
    } catch (error) {
      logger.error({ err: error }, 'Error searching users');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }

  async register() {
    this.app.get(
      '/search/tweets',
      { preValidation: authMiddleware, ...searchTweetsRouteOpts },
      this.searchTweets.bind(this),
    );
    this.app.get(
      '/search/users',
      { preValidation: authMiddleware, ...searchUsersRouteOpts },
      this.searchUsers.bind(this),
    );
  }
}
