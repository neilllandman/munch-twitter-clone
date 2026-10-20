import { timestampProperties } from '../shared/schemas/response';

const tweetProperties = {
  id: { type: 'integer' },
  content: { type: 'string' },
  ...timestampProperties,
};

const tweetRequired = ['id', 'content', 'createdAt', 'updatedAt'];

const authorSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    username: { type: 'string' },
    email: { type: 'string' },
  },
  required: ['id', 'username', 'email'],
  additionalProperties: false,
};

export const tweetListResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { ...tweetProperties, user: authorSchema },
    required: [...tweetRequired, 'user'],
    additionalProperties: false,
  },
};

export const userTweetsResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      ...tweetProperties,
      taggedUsers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            userId: { type: 'integer' },
            tweetId: { type: 'integer' },
            ...timestampProperties,
          },
          required: ['id', 'userId', 'tweetId', 'createdAt', 'updatedAt'],
          additionalProperties: false,
        },
      },
    },
    required: [...tweetRequired, 'taggedUsers'],
    additionalProperties: false,
  },
};

export const createdTweetResponseSchema = {
  type: 'object',
  properties: { ...tweetProperties, userId: { type: 'integer' } },
  required: [...tweetRequired, 'userId'],
  additionalProperties: false,
};
