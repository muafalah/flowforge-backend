import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  mixin,
  Type,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import type {
  RequestUser,
  OrganizationMemberInfo,
} from '../interfaces/request-user.interface';

@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & {
        user: RequestUser;
        organizationMember: OrganizationMemberInfo;
      }
    >();

    const organizationId = request.params.id as string;
    const userId = request.user?.userId;

    if (!organizationId || !userId) {
      throw new HttpException(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Organization ID and authentication are required.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if organization exists and is not soft-deleted
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });

    if (!organization) {
      throw new HttpException(
        {
          error: {
            code: 'ORGANIZATION_NOT_FOUND',
            message: 'Organization not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Check if user is a member of this organization
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    if (!member) {
      throw new HttpException(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You are not a member of this organization.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Attach membership info to request for downstream use
    request.organizationMember = {
      id: member.id,
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role,
    };

    return true;
  }
}

/**
 * Factory function to create an OrganizationGuard that reads the
 * organization ID from a configurable route parameter name.
 *
 * Usage: @UseGuards(OrganizationGuardWithParam('organizationId'))
 */
export function OrganizationGuardWithParam(
  paramName: string,
): Type<CanActivate> {
  @Injectable()
  class OrganizationGuardMixin implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<
        Request & {
          user: RequestUser;
          organizationMember: OrganizationMemberInfo;
        }
      >();

      const organizationId = request.params[paramName] as string;
      const userId = request.user?.userId;

      if (!organizationId || !userId) {
        throw new HttpException(
          {
            error: {
              code: 'BAD_REQUEST',
              message: 'Organization ID and authentication are required.',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
      });

      if (!organization) {
        throw new HttpException(
          {
            error: {
              code: 'ORGANIZATION_NOT_FOUND',
              message: 'Organization not found.',
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const member = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
      });

      if (!member) {
        throw new HttpException(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'You are not a member of this organization.',
            },
          },
          HttpStatus.FORBIDDEN,
        );
      }

      request.organizationMember = {
        id: member.id,
        organizationId: member.organizationId,
        userId: member.userId,
        role: member.role,
      };

      return true;
    }
  }

  return mixin(OrganizationGuardMixin);
}
