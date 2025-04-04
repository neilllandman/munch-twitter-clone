import { FastifyInstance } from 'fastify';
import { User } from '../database/models';
import { compare, hash } from 'bcryptjs';
import { JwtToken } from './dtos/jwt-token';
import { FindAttributeOptions } from 'sequelize';

export class AuthService {
  /**
   *
   * @param app FastifyInstance
   */
  constructor(private readonly app: FastifyInstance) {}

  /**
   *
   * @param details
   * @returns
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

  generateToken(user: User): string {
    // Generate a JWT token using the user details
    const tokenData: JwtToken = {
      usr: { id: user.id, email: user.email, username: user.username },
      sub: user.id,
    };
    return this.app.jwt.sign(tokenData);
  }

  async encryptPassword(password: string): Promise<string> {
    return hash(password, 10);
  }

  async comparePassword(password: string, hashed: string): Promise<boolean> {
    return compare(password, hashed);
  }
}
