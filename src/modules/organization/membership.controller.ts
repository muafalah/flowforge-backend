import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { MembershipService } from './membership.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentMember } from '../../common/decorators/organization-member.decorator';
import type { OrganizationMemberInfo } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { addMemberSchema } from './schemas/add-member.schema';
import { updateMemberRoleSchema } from './schemas/update-member-role.schema';
import { transferOwnershipSchema } from './schemas/transfer-ownership.schema';
import { queryParamsSchema } from './schemas/query-params.schema';
import { findMemberByUserParamsSchema } from './schemas/find-member-by-user.schema';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { QueryParamsDto } from './dto/query-params.dto';
import { MembersListResponseDto } from './dto/members-list-response.dto';
import { MembershipResponseDto } from './dto/membership-response.dto';
import { MembershipActionResponseDto } from './dto/membership-action-response.dto';

@ApiTags('Organization Members')
@Controller('organizations/:id/members')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get()
  @UseGuards(JwtAuthGuard, OrganizationGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all members of an organization' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Members retrieved successfully.',
    type: MembersListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Not a member of this organization.',
    schema: {
      example: {
        error: {
          code: 'FORBIDDEN',
          message: 'You are not a member of this organization.',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found.',
    schema: {
      example: {
        error: {
          code: 'ORGANIZATION_NOT_FOUND',
          message: 'Organization not found.',
        },
      },
    },
  })
  findAll(
    @Param('id') organizationId: string,
    @Query(new ZodValidationPipe(queryParamsSchema)) query: QueryParamsDto,
  ) {
    return this.membershipService.findAll(organizationId, query);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, OrganizationGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get membership detail of a specific user in an organization',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'userId',
    description: 'UUID of the user to look up',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Member retrieved successfully.',
    type: MembershipResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Not a member of this organization.',
    schema: {
      example: {
        error: {
          code: 'FORBIDDEN',
          message: 'You are not a member of this organization.',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Member not found in this organization.',
    schema: {
      example: {
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: 'Member not found in this organization.',
        },
      },
    },
  })
  findByUserId(
    @Param('id', new ZodValidationPipe(findMemberByUserParamsSchema.shape.id))
    organizationId: string,
    @Param(
      'userId',
      new ZodValidationPipe(findMemberByUserParamsSchema.shape.userId),
    )
    userId: string,
  ) {
    return this.membershipService.findByUserId(organizationId, userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, OrganizationGuard, RolesGuard)
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a member to the organization by email' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: AddMemberDto })
  @ApiResponse({
    status: 201,
    description: 'Member added successfully.',
    type: MembershipActionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        error: {
          code: 'USER_NOT_FOUND',
          message: 'No user found with this email address.',
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Member already exists.',
    schema: {
      example: {
        error: {
          code: 'MEMBER_ALREADY_EXISTS',
          message: 'This user is already a member of the organization.',
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions.',
    schema: {
      example: {
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
        },
      },
    },
  })
  addMember(
    @Param('id') organizationId: string,
    @Body(new ZodValidationPipe(addMemberSchema)) dto: AddMemberDto,
  ) {
    return this.membershipService.addMember(organizationId, dto);
  }

  @Patch(':memberId')
  @UseGuards(JwtAuthGuard, OrganizationGuard, RolesGuard)
  @Roles(OrganizationRole.OWNER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a member role' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'memberId',
    description: 'UUID of the member to update',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiBody({ type: UpdateMemberRoleDto })
  @ApiResponse({
    status: 200,
    description: 'Member role updated successfully.',
    type: MembershipActionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Member not found.',
    schema: {
      example: {
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: 'Member not found in this organization.',
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Cannot change owner role.',
    schema: {
      example: {
        error: {
          code: 'FORBIDDEN',
          message:
            'Cannot change the role of an owner. Use transfer-ownership endpoint instead.',
        },
      },
    },
  })
  updateRole(
    @Param('id') organizationId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema))
    dto: UpdateMemberRoleDto,
  ) {
    return this.membershipService.updateRole(organizationId, memberId, dto);
  }

  @Delete(':memberId')
  @UseGuards(JwtAuthGuard, OrganizationGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'memberId',
    description: 'UUID of the member to remove',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Member removed successfully.',
    schema: {
      example: {
        message: 'Member removed successfully.',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Cannot remove owner or insufficient permissions.',
    schema: {
      example: {
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot remove the owner. Transfer ownership first.',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Member not found.',
    schema: {
      example: {
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: 'Member not found in this organization.',
        },
      },
    },
  })
  removeMember(
    @Param('id') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentMember() currentMember: OrganizationMemberInfo,
  ) {
    return this.membershipService.removeMember(
      organizationId,
      memberId,
      currentMember,
    );
  }
}

// Transfer ownership is on a separate path but within the same file
// to keep all membership-related actions together
@ApiTags('Organizations')
@Controller('organizations/:id')
export class TransferOwnershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Post('transfer-ownership')
  @UseGuards(JwtAuthGuard, OrganizationGuard, RolesGuard)
  @Roles(OrganizationRole.OWNER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer ownership to another member' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: TransferOwnershipDto })
  @ApiResponse({
    status: 200,
    description: 'Ownership transferred successfully.',
    schema: {
      example: {
        message: 'Ownership transferred successfully.',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Target member not found.',
    schema: {
      example: {
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: 'Target member not found in this organization.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Target is already the owner.',
    schema: {
      example: {
        error: {
          code: 'BAD_REQUEST',
          message: 'Target member is already the owner.',
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Only owner can transfer ownership.',
    schema: {
      example: {
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
        },
      },
    },
  })
  transferOwnership(
    @Param('id') organizationId: string,
    @Body(new ZodValidationPipe(transferOwnershipSchema))
    dto: TransferOwnershipDto,
    @CurrentMember() currentMember: OrganizationMemberInfo,
  ) {
    return this.membershipService.transferOwnership(
      organizationId,
      dto,
      currentMember,
    );
  }
}
