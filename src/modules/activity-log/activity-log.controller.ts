import {
  Controller,
  Get,
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
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { ActivityLogService } from './activity-log.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { activityLogQueryParamsSchema } from './schemas/activity-log-query-params.schema';
import { ActivityLogQueryParamsDto } from './dto/activity-log-query-params.dto';
import { ActivityLogListResponseDto } from './dto/activity-log-response.dto';

@ApiTags('Activity Logs')
@Controller('organizations/:organizationId/activity-logs')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List activity logs for an organization',
    description:
      'Returns a paginated list of activity logs. Only accessible by OWNER and ADMIN roles.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Activity logs retrieved successfully.',
    type: ActivityLogListResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions — OWNER or ADMIN role required.',
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
  findAll(
    @Param('organizationId') organizationId: string,
    @Query(new ZodValidationPipe(activityLogQueryParamsSchema))
    query: ActivityLogQueryParamsDto,
  ) {
    return this.activityLogService.findAll(organizationId, query);
  }
}
