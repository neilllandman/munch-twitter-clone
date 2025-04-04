import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { compare } from 'bcryptjs';
import { ControllerInterface } from '../shared/interfaces/controller.interface';
import { User } from '../database/models';
import { AuthService } from './auth.service';
import { loginRouteOpts, registrationRouteOpts } from './route-options';
import { JwtToken } from './dtos/jwt-token';
import { LoginResponse } from './dtos/login.response';
import { RegisterResponse } from './dtos/register.response';
import { authMiddleware } from './auth.middleware';

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
      const token = req.user as JwtToken;
      const id = token.sub;
      const user = await User.findOne({
        where: { id },
        attributes: ['id', 'email', 'username', 'createdAt', 'updatedAt'],
      });
      return reply.send(user);
    } catch (err) {
      return reply.send(err);
    }
    return;
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

      const hashedPassword = await this.authService.encryptPassword(password);
      const userDetails = { username, email, password: hashedPassword };
      const newUser = await User.create(userDetails);
      const token = this.authService.generateToken(newUser);

      const response: RegisterResponse = this.buildLoginResponse(
        token,
        newUser,
      );

      return reply.send(response);
    } catch (err) {
      console.error(err);
      reply.status(500).send({
        error: 'Internal server error',
      });
    }
  }

  /**
   *
   */
  async login(
    req: FastifyRequest<{
      Body: { email: string; password: string; username: string };
    }>,
    reply: FastifyReply,
  ) {
    const { email, password, username } = req.body;

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

    const response: LoginResponse = this.buildLoginResponse(token, user);
    return reply.send(response);
  }

  /**
   * Registers the routes for auth operations.
   */
  async register() {
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

  /**
   *
   */
  private buildLoginResponse(token: string, user: User): LoginResponse {
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }
}
