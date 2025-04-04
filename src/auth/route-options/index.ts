import { RouteShorthandOptions } from 'fastify';

export const loginRouteOpts: RouteShorthandOptions = {
  schema: {
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
