export const timestampProperties = {
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};

// Preserve both application errors ({ error }) and Fastify's validation errors.
const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    statusCode: { type: 'integer' },
    code: { type: 'string' },
  },
  required: ['error'],
  additionalProperties: false,
};

export const errorResponses = {
  '4xx': errorResponseSchema,
  '5xx': errorResponseSchema,
};
