import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import type { RequestUser } from '../../../common/interfaces/request-user.interface';
import type { Request } from 'express';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  getProfile: jest.fn(),
};

/**
 * Unit tests for AuthController.
 *
 * Tests controller-level logic (method delegation, response shaping)
 * with a fully mocked AuthService. No real service or database involved.
 */
describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  const mockReq = {
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
  } as unknown as Request;

  describe('register', () => {
    const registerDto = {
      name: 'John Doe',
      email: 'john@email.com',
      password: 'securepassword',
    };

    it('should delegate to AuthService.register and return result', async () => {
      const expected = {
        message: 'Account created successfully.',
        data: {
          user: {
            id: 'test-uuid',
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      };
      mockAuthService.register.mockResolvedValue(expected);

      const result = await controller.register(registerDto);

      expect(result).toEqual(expected);
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
    });

    it('should propagate HttpException from service', async () => {
      mockAuthService.register.mockRejectedValue(
        new HttpException(
          { error: { code: 'EMAIL_ALREADY_EXISTS' } },
          HttpStatus.CONFLICT,
        ),
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'john@email.com',
      password: 'securepassword',
    };

    it('should delegate to AuthService.login with dto and request', async () => {
      const expected = {
        message: 'Login successful.',
        data: {
          accessToken: 'jwt-token',
          refreshToken: 'refresh-token',
          user: { id: 'test-uuid', name: 'John', email: 'john@email.com' },
        },
      };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.login(loginDto, mockReq);

      expect(result).toEqual(expected);
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto, mockReq);
    });
  });

  describe('refresh', () => {
    it('should delegate to AuthService.refreshToken', async () => {
      const dto = { refreshToken: 'valid-token' };
      const expected = {
        message: 'Token refreshed successfully.',
        data: {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        },
      };
      mockAuthService.refreshToken.mockResolvedValue(expected);

      const result = await controller.refresh(dto);

      expect(result).toEqual(expected);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(dto);
    });
  });

  describe('logout', () => {
    it('should delegate to AuthService.logout', async () => {
      const dto = { refreshToken: 'token-to-invalidate' };
      const expected = { message: 'Logged out successfully.' };
      mockAuthService.logout.mockResolvedValue(expected);

      const result = await controller.logout(dto);

      expect(result).toEqual(expected);
      expect(mockAuthService.logout).toHaveBeenCalledWith(dto);
    });
  });

  describe('getProfile', () => {
    it('should delegate to AuthService.getProfile with current user', async () => {
      const user: RequestUser = {
        userId: 'test-uuid',
        name: 'John Doe',
        email: 'john@email.com',
      };
      const expected = {
        message: 'User retrieved successfully.',
        data: {
          user: { id: 'test-uuid', name: 'John Doe', email: 'john@email.com' },
        },
      };
      mockAuthService.getProfile.mockResolvedValue(expected);

      const result = await controller.getProfile(user);

      expect(result).toEqual(expected);
      expect(mockAuthService.getProfile).toHaveBeenCalledWith(user);
    });
  });
});
