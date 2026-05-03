import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserInput } from './schemas/update-user.schema';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async updateUser(id: string, dto: UpdateUserInput) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new HttpException(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { name: dto.name },
    });

    return {
      message: 'User updated successfully.',
      data: {
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
        },
      },
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new HttpException(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      message: 'User retrieved successfully.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    };
  }

  async softDeleteUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new HttpException(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.session.deleteMany({
        where: { userId: id },
      }),
    ]);

    return {
      message: 'User deleted successfully.',
    };
  }
}
