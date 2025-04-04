import { User } from '../../database/models/user';

export class RegisterResponse {
  token: string;
  user: Partial<User>;
}
