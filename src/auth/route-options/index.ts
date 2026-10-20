import { RouteShorthandOptions } from 'fastify';
import { errorResponses } from '../../shared/schemas/response';
import { authResponseSchema, userResponseSchema } from '../response-schemas';

const authResponses = { 200: authResponseSchema, ...errorResponses };

export const userRouteOpts: RouteShorthandOptions = {
  schema: {
    response: {
      200: { ...userResponseSchema, nullable: true },
      ...errorResponses,
    },
  },
};

export const loginRouteOpts: RouteShorthandOptions = {
  schema: {
    response: authResponses,
    body: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
      required: ['password'],
      anyOf: [{ required: ['username'] }, { required: ['email'] }],
    },
  },
};

export const registrationRouteOpts: RouteShorthandOptions = {
  schema: {
    response: authResponses,
    body: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
      },
      required: ['email', 'username', 'password'],
      additionalProperties: false,
    },
  },
};
