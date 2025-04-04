import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { compare } from 'bcryptjs';
import { ControllerInterface } from '../shared/interfaces/controller.interface';
import { AuthService } from './auth.service';
import { loginRouteOpts, registrationRouteOpts } from './route-options';
import { AuthResponse } from './dtos/auth.response';
import { authMiddleware } from './auth.middleware';
import { logger } from '../shared/utils/logger';
export class AuthController implements ControllerInterface {
  authService: AuthService;

  constructor(private readonly app: FastifyInstance) {
    this.authService = new AuthService(app);
  }

  /**
   *  Returns the currently authenticated user
   */
  async user(req: FastifyRequest, reply: FastifyReply) {
    try {
      const user = this.authService.getAuthenticatedUser(
        req as FastifyRequest<{ Headers: { authorization: string } }>,
      );
      return reply.send(user);
    } catch (err) {
      logger.error(err);
      return reply.send(err);
    }
  }

  /**
   * Registers a new user.
   */
  async registerUser(
    req: FastifyRequest<{
      Body: { username: string; email: string; password: string };
    }>,
    reply: FastifyReply,
  ) {
    const { email, password, username } = req.body;

    try {
      const user = await this.authService.getUserFromCredentials({
        username,
        email,
      });

      if (user) {
        return reply.status(409).send({
          error: 'Email or username taken',
        });
      }

      const newUser = await this.authService.registerUser({
        username,
        email,
        plainTextPassword: password,
      });
      const token = this.authService.generateToken(newUser);

      const response: AuthResponse = this.authService.buildAuthResponse(
        token,
        newUser,
      );

      return reply.send(response);
    } catch (err) {
      logger.error(err);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  }

  /**
   * Logs in a user and returns an authentication token.
   */
  async login(
    req: FastifyRequest<{
      Body: { email: string; password: string; username: string };
    }>,
    reply: FastifyReply,
  ) {
    const { email, password, username } = req.body;

    try {
      const user = await this.authService.getUserFromCredentials({
        username,
        email,
      });

      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const isValid = await compare(password, user.password);
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const token = this.authService.generateToken(user);

      const response: AuthResponse = this.authService.buildAuthResponse(
        token,
        user,
      );
      return reply.send(response);
    } catch (err) {
      logger.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }

  /**
   * Registers authentication-related routes for the application.
   *
   * This method sets up the following routes:
   * - POST `/auth/register`: Handles user registration.
   * - POST `/auth/login`: Handles user login.
   * - GET `/auth/user`: Retrieves the authenticated user's information. Requires authentication.
   *
   */
  async register() {
    // Need to use `bind` to ensure `this` context is correct
    this.app.post(
      '/auth/register',
      registrationRouteOpts,
      this.registerUser.bind(this),
    );

    this.app.post('/auth/login', loginRouteOpts, this.login.bind(this));

    this.app.get(
      '/auth/user',
      { preValidation: authMiddleware },
      this.user.bind(this),
    );
  }
}
