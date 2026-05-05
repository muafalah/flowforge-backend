import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { OrganizationRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { OrganizationMemberInfo } from '../interfaces/request-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { organizationMember: OrganizationMemberInfo }>();
    const member = request.organizationMember;

    if (!member) {
      throw new HttpException(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const hasRole = requiredRoles.includes(member.role as OrganizationRole);

    if (!hasRole) {
      throw new HttpException(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to perform this action.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
