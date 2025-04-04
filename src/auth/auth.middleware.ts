import { FastifyReply, FastifyRequest } from 'fastify';

export const authMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    await request.jwtVerify(); // ✅ Verifies JWT
  } catch (err) {
    console.error(err);
    reply.code(401).send({ error: 'Unauthorized' });
  }
};
