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
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createOrganizationSchema } from './schemas/create-organization.schema';
import { updateOrganizationSchema } from './schemas/update-organization.schema';
import { queryParamsSchema } from './schemas/query-params.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QueryParamsDto } from './dto/query-params.dto';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiBody({ type: CreateOrganizationDto })
  @ApiResponse({
    status: 201,
    description: 'Organization created successfully.',
    schema: {
      example: {
        message: 'Organization created successfully.',
        data: {
          organization: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Acme Corporation',
            createdAt: '2026-05-04T00:00:00.000Z',
            updatedAt: '2026-05-04T00:00:00.000Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error.',
    schema: {
      example: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data.',
          fields: {
            name: 'Organization name must be at least 3 characters.',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token.',
    schema: {
      example: {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
        },
      },
    },
  })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createOrganizationSchema))
    dto: CreateOrganizationDto,
  ) {
    return this.organizationService.create(user.userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List organizations where user is a member' })
  @ApiResponse({
    status: 200,
    description: 'Organizations retrieved successfully.',
    schema: {
      example: {
        message: 'Organizations retrieved successfully.',
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Acme Corporation',
            memberCount: 5,
            createdAt: '2026-05-04T00:00:00.000Z',
            updatedAt: '2026-05-04T00:00:00.000Z',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token.',
    schema: {
      example: {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
        },
      },
    },
  })
  findAll(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(queryParamsSchema)) query: QueryParamsDto,
  ) {
    return this.organizationService.findAll(user.userId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, OrganizationGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get organization details' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Organization retrieved successfully.',
    schema: {
      example: {
        message: 'Organization retrieved successfully.',
        data: {
          organization: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Acme Corporation',
            memberCount: 5,
            createdAt: '2026-05-04T00:00:00.000Z',
            updatedAt: '2026-05-04T00:00:00.000Z',
          },
        },
      },
    },
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
  findOne(@Param('id') id: string) {
    return this.organizationService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, OrganizationGuard, RolesGuard)
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update organization name' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiResponse({
    status: 200,
    description: 'Organization updated successfully.',
    schema: {
      example: {
        message: 'Organization updated successfully.',
        data: {
          organization: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Acme Corp Renamed',
            createdAt: '2026-05-04T00:00:00.000Z',
            updatedAt: '2026-05-04T00:00:00.000Z',
          },
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
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema))
    dto: UpdateOrganizationDto,
  ) {
    return this.organizationService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, OrganizationGuard, RolesGuard)
  @Roles(OrganizationRole.OWNER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete an organization' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Organization deleted successfully.',
    schema: {
      example: {
        message: 'Organization deleted successfully.',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Only owner can delete.',
    schema: {
      example: {
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.',
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
  remove(@Param('id') id: string) {
    return this.organizationService.softDelete(id);
  }
}
