import { RouteShorthandOptions } from 'fastify';
import { errorResponses } from '../../shared/schemas/response';
import { tweetListResponseSchema } from '../../tweets/response-schemas';

const querystring = {
  type: 'object',
  properties: {
    q: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
    beforeId: { type: 'integer', minimum: 1, maximum: 2147483647 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  },
  required: ['q'],
  additionalProperties: false,
};

export const searchTweetsRouteOpts: RouteShorthandOptions = {
  schema: {
    querystring,
    response: { 200: tweetListResponseSchema, ...errorResponses },
  },
};

export const searchUsersRouteOpts: RouteShorthandOptions = {
  schema: {
    querystring,
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'integer' }, username: { type: 'string' } },
          required: ['id', 'username'],
          additionalProperties: false,
        },
      },
      ...errorResponses,
    },
  },
};
