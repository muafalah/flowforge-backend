import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { OrganizationMemberInfo } from '../interfaces/request-user.interface';

export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrganizationMemberInfo => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { organizationMember: OrganizationMemberInfo }>();
    return request.organizationMember;
  },
);
