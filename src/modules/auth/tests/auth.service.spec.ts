import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../database/prisma.service';

jest.mock('bcrypt');

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      JWT_SECRET: 'test-jwt-secret',
      JWT_EXPIRATION: '15m',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_REFRESH_EXPIRATION: '7d',
    };
    return config[key];
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      name: 'John Doe',
      email: 'john@email.com',
      password: 'securepassword',
    };

    it('should register a user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrismaService.user.create.mockResolvedValue({
        id: 'test-uuid',
        name: 'John Doe',
        email: 'john@email.com',
        passwordHash: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const result = await service.register(registerDto);

      expect(result).toEqual({
        message: 'Account created successfully.',
        data: {
          user: {
            id: 'test-uuid',
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('securepassword', 10);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          name: 'John Doe',
          email: 'john@email.com',
          passwordHash: 'hashed_password',
        },
      });
    });

    it('should throw EMAIL_ALREADY_EXISTS if email is taken', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-uuid',
        email: 'john@email.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        HttpException,
      );

      try {
        await service.register(registerDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.CONFLICT);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('EMAIL_ALREADY_EXISTS');
      }
    });

    it('should hash the password with 10 salt rounds', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      mockPrismaService.user.create.mockResolvedValue({
        id: 'test-uuid',
        name: 'John Doe',
        email: 'john@email.com',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      await service.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('securepassword', 10);
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'john@email.com',
      password: 'securepassword',
    };

    const mockReq = {
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
    } as unknown as import('express').Request;

    const mockUser = {
      id: 'test-uuid',
      name: 'John Doe',
      email: 'john@email.com',
      passwordHash: 'hashed_password',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should login successfully and return tokens', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign
        .mockReturnValueOnce('access_token')
        .mockReturnValueOnce('refresh_token');
      mockPrismaService.session.create.mockResolvedValue({ id: 'session-id' });

      const result = await service.login(loginDto, mockReq);

      expect(result).toEqual({
        message: 'Login successful.',
        data: {
          accessToken: 'access_token',
          refreshToken: 'refresh_token',
          user: {
            id: 'test-uuid',
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      });
      expect(mockPrismaService.session.create).toHaveBeenCalled();
    });

    it('should throw USER_NOT_FOUND if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      try {
        await service.login(loginDto, mockReq);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('USER_NOT_FOUND');
      }
    });

    it('should throw INVALID_CREDENTIALS if password is wrong', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      try {
        await service.login(loginDto, mockReq);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should create a session record on successful login', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign
        .mockReturnValueOnce('access_token')
        .mockReturnValueOnce('refresh_token');
      mockPrismaService.session.create.mockResolvedValue({ id: 'session-id' });

      await service.login(loginDto, mockReq);

      expect(mockPrismaService.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'test-uuid',
          accessToken: 'access_token',
          refreshToken: 'refresh_token',
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
        }) as Record<string, unknown>,
      });
    });
  });

  describe('refreshToken', () => {
    const refreshDto = { refreshToken: 'valid_refresh_token' };

    it('should refresh tokens successfully with rotation', async () => {
      mockJwtService.verify.mockReturnValue({
        userId: 'test-uuid',
        name: 'John Doe',
        email: 'john@email.com',
      });

      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockPrismaService.session.findFirst.mockResolvedValue({
        id: 'session-id',
        refreshToken: 'valid_refresh_token',
        expiresAt: futureDate,
      });

      mockJwtService.sign
        .mockReturnValueOnce('new_access_token')
        .mockReturnValueOnce('new_refresh_token');

      mockPrismaService.session.update.mockResolvedValue({});

      const result = await service.refreshToken(refreshDto);

      expect(result).toEqual({
        message: 'Token refreshed successfully.',
        data: {
          accessToken: 'new_access_token',
          refreshToken: 'new_refresh_token',
        },
      });
      expect(mockPrismaService.session.update).toHaveBeenCalled();
    });

    it('should throw if refresh token signature is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      try {
        await service.refreshToken(refreshDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('REFRESH_TOKEN_EXPIRED');
      }
    });

    it('should throw if session is not found', async () => {
      mockJwtService.verify.mockReturnValue({
        userId: 'test-uuid',
        name: 'John Doe',
        email: 'john@email.com',
      });
      mockPrismaService.session.findFirst.mockResolvedValue(null);

      try {
        await service.refreshToken(refreshDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('should throw and delete session if expired', async () => {
      mockJwtService.verify.mockReturnValue({
        userId: 'test-uuid',
        name: 'John Doe',
        email: 'john@email.com',
      });

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockPrismaService.session.findFirst.mockResolvedValue({
        id: 'session-id',
        refreshToken: 'valid_refresh_token',
        expiresAt: pastDate,
      });
      mockPrismaService.session.delete.mockResolvedValue({});

      try {
        await service.refreshToken(refreshDto);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(mockPrismaService.session.delete).toHaveBeenCalledWith({
          where: { id: 'session-id' },
        });
      }
    });
  });

  describe('logout', () => {
    it('should delete the session successfully', async () => {
      mockPrismaService.session.findFirst.mockResolvedValue({
        id: 'session-id',
        refreshToken: 'token',
      });
      mockPrismaService.session.delete.mockResolvedValue({});

      const result = await service.logout({ refreshToken: 'token' });

      expect(result).toEqual({ message: 'Logged out successfully.' });
      expect(mockPrismaService.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-id' },
      });
    });

    it('should succeed even if token is not found (idempotent)', async () => {
      mockPrismaService.session.findFirst.mockResolvedValue(null);

      const result = await service.logout({
        refreshToken: 'nonexistent_token',
      });

      expect(result).toEqual({ message: 'Logged out successfully.' });
      expect(mockPrismaService.session.delete).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('should return user profile from request user', () => {
      const requestUser = {
        userId: 'test-uuid',
        name: 'John Doe',
        email: 'john@email.com',
      };

      const result = service.getProfile(requestUser);

      expect(result).toEqual({
        message: 'User retrieved successfully.',
        data: {
          user: {
            id: 'test-uuid',
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      });
    });
  });
});
