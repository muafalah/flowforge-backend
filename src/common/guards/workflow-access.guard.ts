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
import type { OrganizationMemberInfo } from '../interfaces/request-user.interface';

/**
 * Factory function to create a guard that checks whether the current user
 * has write access to a specific workflow based on:
 *   - Their organization role (OWNER/ADMIN always have access)
 *   - The workflow's `access` field (MEMBER allowed only when access = EDITOR)
 *
 * Usage: @UseGuards(WorkflowAccessGuard('organizationId', 'workflowId'))
 *
 * Must be placed AFTER OrganizationGuardWithParam so that
 * `request.organizationMember` is already populated.
 */
export function WorkflowAccessGuard(
  orgParamName: string,
  workflowParamName: string,
): Type<CanActivate> {
  @Injectable()
  class WorkflowAccessGuardMixin implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
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

      // OWNER and ADMIN always have full access
      if (member.role === 'OWNER' || member.role === 'ADMIN') {
        return true;
      }

      // For MEMBER role, check the workflow's access field
      const organizationId = request.params[orgParamName] as string;
      const workflowId = request.params[workflowParamName] as string;

      if (!organizationId || !workflowId) {
        throw new HttpException(
          {
            error: {
              code: 'BAD_REQUEST',
              message: 'Organization ID and Workflow ID are required.',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const workflow = await this.prisma.workflow.findFirst({
        where: {
          id: workflowId,
          organizationId,
          deletedAt: null,
        },
        select: { access: true },
      });

      if (!workflow) {
        throw new HttpException(
          {
            error: {
              code: 'WORKFLOW_NOT_FOUND',
              message: 'Workflow not found.',
            },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (workflow.access !== 'EDITOR') {
        throw new HttpException(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'You do not have permission to modify this workflow.',
            },
          },
          HttpStatus.FORBIDDEN,
        );
      }

      return true;
    }
  }

  return mixin(WorkflowAccessGuardMixin);
}
