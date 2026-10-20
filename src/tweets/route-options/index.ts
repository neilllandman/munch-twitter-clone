import { RouteShorthandOptions } from 'fastify';
import { errorResponses } from '../../shared/schemas/response';
import {
  createdTweetResponseSchema,
  tweetListResponseSchema,
  userTweetsResponseSchema,
} from '../response-schemas';

export const tweetQueryRouteOpts: RouteShorthandOptions = {
  schema: {
    response: { 200: tweetListResponseSchema, ...errorResponses },
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

export const userTweetQueryRouteOpts: RouteShorthandOptions = {
  ...tweetQueryRouteOpts,
  schema: {
    ...tweetQueryRouteOpts.schema,
    response: { 200: userTweetsResponseSchema, ...errorResponses },
  },
};

export const createTweetRouteOpts: RouteShorthandOptions = {
  schema: {
    response: { 201: createdTweetResponseSchema, ...errorResponses },
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
