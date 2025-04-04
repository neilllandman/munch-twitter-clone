import { RouteShorthandOptions } from 'fastify';

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
