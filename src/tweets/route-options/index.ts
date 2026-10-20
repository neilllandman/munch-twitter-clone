import { RouteShorthandOptions } from 'fastify';

export const tweetQueryRouteOpts: RouteShorthandOptions = {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        beforeId: { type: 'integer', minimum: 1, maximum: 2147483647 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
      additionalProperties: false,
    },
  },
};

export const createTweetRouteOpts: RouteShorthandOptions = {
  schema: {
    body: {
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 280 },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
};
