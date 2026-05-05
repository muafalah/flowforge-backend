import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { UserService } from '../user.service';
import { PrismaService } from '../../../database/prisma.service';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  session: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn((promises) => Promise.all(promises)),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);

    jest.clearAllMocks();
  });

  describe('updateUser', () => {
    const userId = 'test-uuid';
    const updateDto = { name: 'Jane Doe' };

    const mockUser = {
      id: userId,
      name: 'John Doe',
      email: 'john@email.com',
      passwordHash: 'hashed_password',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should update user name successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Jane Doe',
      });

      const result = await service.updateUser(userId, updateDto);

      expect(result).toEqual({
        message: 'User updated successfully.',
        data: {
          user: {
            id: userId,
            name: 'Jane Doe',
            email: 'john@email.com',
          },
        },
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId, deletedAt: null },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'Jane Doe' },
      });
    });

    it('should throw USER_NOT_FOUND if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      try {
        await service.updateUser(userId, updateDto);
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

    it('should throw USER_NOT_FOUND for soft-deleted user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUser(userId, updateDto)).rejects.toThrow(
        HttpException,
      );

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId, deletedAt: null },
      });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should not expose password or sensitive fields in response', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Jane Doe',
      });

      const result = await service.updateUser(userId, updateDto);
      const user = result.data.user;

      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('deletedAt');
      expect(user).not.toHaveProperty('createdAt');
      expect(user).not.toHaveProperty('updatedAt');
    });
  });

  describe('getUserById', () => {
    const userId = 'test-uuid';
    const mockUser = {
      id: userId,
      name: 'John Doe',
      email: 'john@email.com',
      passwordHash: 'hashed_password',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should retrieve user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserById(userId);

      expect(result).toEqual({
        message: 'User retrieved successfully.',
        data: {
          user: {
            id: userId,
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId, deletedAt: null },
      });
    });

    it('should throw USER_NOT_FOUND if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      try {
        await service.getUserById(userId);
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

    it('should throw USER_NOT_FOUND for soft-deleted user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserById(userId)).rejects.toThrow(HttpException);
    });

    it('should not expose password or sensitive fields in response', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserById(userId);
      const user = result.data.user;

      expect(user).not.toHaveProperty('passwordHash');
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('deletedAt');
    });
  });

  describe('softDeleteUser', () => {
    const userId = 'test-uuid';
    const mockUser = {
      id: userId,
      name: 'John Doe',
      email: 'john@email.com',
      passwordHash: 'hashed_password',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should soft delete user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      const result = await service.softDeleteUser(userId);

      expect(result).toEqual({
        message: 'User deleted successfully.',
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId, deletedAt: null },
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { deletedAt: expect.any(Date) as Date },
      });
      expect(mockPrismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should throw USER_NOT_FOUND if user does not exist or is already deleted', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      try {
        await service.softDeleteUser(userId);
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
  });
});
