import { timestampProperties } from '../shared/schemas/response';

export const userResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    email: { type: 'string' },
    username: { type: 'string' },
    ...timestampProperties,
  },
  // Login currently selects no timestamps; omit them when absent.
  required: ['id', 'email', 'username'],
  additionalProperties: false,
};

export const authResponseSchema = {
  type: 'object',
  properties: {
    token: { type: 'string' },
    user: userResponseSchema,
  },
  required: ['token', 'user'],
  additionalProperties: false,
};
