export class AuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
    username: string;
    createdAt: Date;
    updatedAt: Date;
  };
}
