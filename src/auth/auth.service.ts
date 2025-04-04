import { FastifyInstance, FastifyRequest } from 'fastify';
import { User } from '../database/models';
import { compare, hash } from 'bcryptjs';
import { JwtToken } from './dtos/jwt-token';
import { FindAttributeOptions } from 'sequelize';
import { AuthResponse } from './dtos/auth.response';

export class AuthService {
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Registers a new user in the database.
   */
  async registerUser(userDetails: {
    username: string;
    email: string;
    plainTextPassword: string;
  }) {
    const { username, email, plainTextPassword } = userDetails;
    const password = await this.encryptPassword(plainTextPassword);

    return User.create({ username, email, password });
  }

  /**
   * Returns the currently authenticated user.
   */
  async getAuthenticatedUser(req: FastifyRequest) {
    const token = req.user as JwtToken;
    return User.findOne({
      where: { id: token.sub },
      attributes: ['id', 'email', 'username', 'createdAt', 'updatedAt'],
    });
  }

  /**
   * Returns the user from the database using the provided username or email.
   */
  async getUserFromCredentials(details: {
    username?: string;
    email?: string;
  }): Promise<User> {
    const { username, email } = details;

    const attributes: FindAttributeOptions = [
      'id',
      'username',
      'email',
      'password',
    ];

    // Check if username or email is provided and fetch the user
    // from the database. Can't use `or` in Sequelize because
    // undefined values are not allowed in where clauses.

    if (username) {
      return User.findOne({
        where: { username },
        attributes,
      });
    } else if (email) {
      return User.findOne({
        where: { email },
        attributes,
      });
    }
    return null;
  }

  /**
   *  Generate a JWT token using the user details
   */
  generateToken(user: User): string {
    const tokenData: JwtToken = {
      usr: { id: user.id, email: user.email, username: user.username },
      sub: user.id,
    };
    return this.app.jwt.sign(tokenData);
  }

  /**
   * Encrypts the password using bcryptjs.
   */
  async encryptPassword(password: string): Promise<string> {
    return hash(password, 10);
  }

  /**
   * Compares the provided password with the hashed password.
   * Returns true if they match, false otherwise.
   */
  async comparePassword(password: string, hashed: string): Promise<boolean> {
    return compare(password, hashed);
  }

  /**
   * Builds the authentication response object from user details and token.
   */
  buildAuthResponse(token: string, user: User): AuthResponse {
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
