import { AuthService } from './auth.service';
import { FastifyInstance } from 'fastify';
import { User } from '../database/models';
import { hash } from 'bcryptjs';

// filepath: /home/neill/scratch/munch-twitter-clone/src/auth/auth.service.test.ts

jest.mock('../database/models');
jest.mock('bcryptjs');

describe('AuthService', () => {
  let authService: AuthService;
  let mockApp: Partial<FastifyInstance>;

  beforeEach(() => {
    mockApp = {
      jwt: {
        sign: jest.fn(),
        options: {
          decode: undefined,
          sign: undefined,
          verify: undefined,
        },
        verify: jest.fn(),
        decode: jest.fn(),
        lookupToken: jest.fn(),
      },
    };
    authService = new AuthService(mockApp as FastifyInstance);
  });

  describe('registerUser', () => {
    it('should create a new user', async () => {
      const userDetails = {
        username: 'test',
        email: 'test@example.org',
        plainTextPassword: 'plaintext-password',
      };
      const hashedPassword = 'hashed-plaintext-password';
      (hash as jest.Mock).mockResolvedValue(hashedPassword);
      (User.create as jest.Mock).mockResolvedValue({ id: 1, ...userDetails });

      const result = await authService.registerUser(userDetails);

      expect(hash).toHaveBeenCalledWith(userDetails.plainTextPassword, 10);
      expect(User.create).toHaveBeenCalledWith({
        username: userDetails.username,
        email: userDetails.email,
        password: hashedPassword,
      });
      expect(result).toEqual({ id: 1, ...userDetails });
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return the authenticated user', async () => {
      const mockToken = { sub: 1 };
      const mockRequest = { user: mockToken } as any;
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.getAuthenticatedUser(mockRequest);

      expect(User.findOne).toHaveBeenCalledWith({
        where: { id: mockToken.sub },
        attributes: ['id', 'email', 'username', 'createdAt', 'updatedAt'],
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('getUserFromCredentials', () => {
    it('should return user by username', async () => {
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.getUserFromCredentials({
        username: 'test',
      });

      expect(User.findOne).toHaveBeenCalledWith({
        where: { username: 'test' },
        attributes: ['id', 'username', 'email', 'password'],
      });
      expect(result).toEqual(mockUser);
    });

    it('should return user by email', async () => {
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
      };
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.getUserFromCredentials({
        email: 'test@example.org',
      });

      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.org' },
        attributes: ['id', 'username', 'email', 'password'],
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null if no username or email is provided', async () => {
      const result = await authService.getUserFromCredentials({});
      expect(result).toBeNull();
    });
  });

  describe('generateToken', () => {
    it('should generate a JWT token', () => {
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
      };
      const mockToken = 'mockJwtToken';
      (mockApp.jwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = authService.generateToken(mockUser as any);

      expect(mockApp.jwt.sign).toHaveBeenCalledWith({
        usr: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
        },
        sub: mockUser.id,
      });
      expect(result).toBe(mockToken);
    });
  });
});
