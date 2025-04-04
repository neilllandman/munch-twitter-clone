import { User } from '../../database/models';

export interface JwtToken {
  sub: number;
  usr: Partial<User>;
  iat?: number;
  exp?: number;
  iss?: string;
}
