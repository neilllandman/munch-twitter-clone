import { User } from '../database/models';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as bcryptjs from 'bcryptjs';

// filepath: /home/neill/scratch/munch-twitter-clone/src/auth/auth.controller.test.ts

jest.mock('./auth.service');

describe('AuthController', () => {
  let authController: AuthController;
  let mockApp: Partial<FastifyInstance>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockApp = {};
    authController = new AuthController(mockApp as FastifyInstance);
    authController.authService = new AuthService(mockApp as FastifyInstance);

    mockReply = {
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  describe('login', () => {
    it('should return a token and user on successful login', async () => {
      const mockRequest = {
        body: {
          email: 'test@example.org',
          password: 'secret-password',
          username: 'test',
        },
      } as FastifyRequest<{
        Body: {
          email: string;
          password: string;
          username: string;
        };
      }>;
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
        password:
          '$2b$10$ysWEMLPyMBHJ.zYGXBEjH.Fw8HPyFmrPj64dj3RmsnnUw1C2O/Wey',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;
      const mockToken = 'mock.jwt.token';
      const mockResponse = { token: mockToken, user: mockUser };

      jest
        .spyOn(authController.authService, 'getUserFromCredentials')
        .mockResolvedValue(mockUser);
      jest
        .spyOn(authController.authService, 'generateToken')
        .mockReturnValue(mockToken);
      jest
        .spyOn(authController.authService, 'buildAuthResponse')
        .mockReturnValue(mockResponse);

      jest
        .spyOn(bcryptjs, 'compare')
        .mockImplementation((_a: string, _b: string) => true);

      await authController.login(mockRequest, mockReply as FastifyReply);

      expect(
        authController.authService.getUserFromCredentials,
      ).toHaveBeenCalledWith({
        email: 'test@example.org',
        username: 'test',
      });
      expect(bcryptjs.compare).toHaveBeenCalledWith(
        'secret-password',
        mockUser.password,
      );
      expect(authController.authService.generateToken).toHaveBeenCalledWith(
        mockUser,
      );
      expect(authController.authService.buildAuthResponse).toHaveBeenCalledWith(
        mockToken,
        mockUser,
      );
      expect(mockReply.send).toHaveBeenCalledWith(mockResponse);
    });

    it('should return 401 if user is not found', async () => {
      const mockRequest = {
        body: {
          email: 'test@example.org',
          password: 'secret-password',
          username: 'test',
        },
      } as FastifyRequest<{
        Body: {
          email: string;
          password: string;
          username: string;
        };
      }>;

      jest
        .spyOn(authController.authService, 'getUserFromCredentials')
        .mockResolvedValue(null);

      await authController.login(mockRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid credentials',
      });
    });

    it('should return 401 for invalid password', async () => {
      const mockRequest = {
        body: {
          email: 'test@example.org',
          password: 'wrongPassword',
          username: 'test',
        },
      } as FastifyRequest<{
        Body: {
          email: 'test@example.org';
          password: 'wrongPassword';
          username: 'test';
        };
      }>;
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
        password:
          '$2b$10$ysWEMLPyMBHJ.zYGXBEjH.Fw8HPyFmrPj64dj3RmsnnUw1C2O/Wey',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      jest
        .spyOn(authController.authService, 'getUserFromCredentials')
        .mockResolvedValue(mockUser);
      jest.spyOn(bcryptjs, 'compare').mockImplementation(async () => false);

      await authController.login(mockRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid credentials',
      });
    });
  });

  describe('registerUser', () => {
    it('should register a new user and return a token', async () => {
      const mockRequest = {
        body: {
          email: 'test@example.org',
          password: 'secret-password',
          username: 'test',
        },
      } as FastifyRequest<{
        Body: {
          email: 'test@example.org';
          password: 'secret-password';
          username: 'test';
        };
      }>;
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
        password:
          '$2b$10$ysWEMLPyMBHJ.zYGXBEjH.Fw8HPyFmrPj64dj3RmsnnUw1C2O/Wey',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;
      const mockToken = 'mock.jwt.token';
      const mockResponse = { token: mockToken, user: mockUser };

      jest
        .spyOn(authController.authService, 'getUserFromCredentials')
        .mockResolvedValue(null);
      jest
        .spyOn(authController.authService, 'registerUser')
        .mockResolvedValue(mockUser);
      jest
        .spyOn(authController.authService, 'generateToken')
        .mockReturnValue(mockToken);
      jest
        .spyOn(authController.authService, 'buildAuthResponse')
        .mockReturnValue(mockResponse);

      await authController.registerUser(mockRequest, mockReply as FastifyReply);

      expect(
        authController.authService.getUserFromCredentials,
      ).toHaveBeenCalledWith({
        email: 'test@example.org',
        username: 'test',
      });
      expect(authController.authService.registerUser).toHaveBeenCalledWith({
        email: 'test@example.org',
        username: 'test',
        plainTextPassword: 'secret-password',
      });
      expect(authController.authService.generateToken).toHaveBeenCalledWith(
        mockUser,
      );
      expect(authController.authService.buildAuthResponse).toHaveBeenCalledWith(
        mockToken,
        mockUser,
      );
      expect(mockReply.send).toHaveBeenCalledWith(mockResponse);
    });

    it('should return 409 if email or username is already taken', async () => {
      const mockRequest = {
        body: {
          email: 'test@example.org',
          password: 'secret-password',
          username: 'test',
        },
      } as FastifyRequest<{
        Body: {
          email: string;
          password: string;
          username: string;
        };
      }>;
      const mockUser = {
        id: 1,
        username: 'test',
        email: 'test@example.org',
      } as User;

      jest
        .spyOn(authController.authService, 'getUserFromCredentials')
        .mockResolvedValue(mockUser);

      await authController.registerUser(mockRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Email or username taken',
      });
    });
  });
});
