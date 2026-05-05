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
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  recentRunsQueryParamsSchema,
  type RecentRunsQueryParamsInput,
} from './schemas/dashboard-query-params.schema';
import {
  DashboardStatsResponseDto,
  RecentRunsResponseDto,
  WorkflowSummaryResponseDto,
} from './dto/dashboard-response.dto';

@ApiTags('Dashboard')
@Controller('organizations/:organizationId/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get dashboard statistics',
    description:
      'Returns aggregated organization-wide metrics including active runs, ' +
      'success/failure rates, average execution time, and hourly sparkline data.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard stats retrieved successfully.',
    type: DashboardStatsResponseDto,
  })
  getStats(@Param('organizationId') organizationId: string) {
    return this.dashboardService.getStats(organizationId);
  }

  @Get('recent-runs')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get recent runs across all workflows',
    description:
      'Returns a paginated list of recent workflow runs across all workflows ' +
      'in the organization, ordered by creation time (newest first).',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for pagination',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'],
    description: 'Filter by run status',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent runs retrieved successfully.',
    type: RecentRunsResponseDto,
  })
  getRecentRuns(
    @Param('organizationId') organizationId: string,
    @Query(new ZodValidationPipe(recentRunsQueryParamsSchema))
    query: RecentRunsQueryParamsInput,
  ) {
    return this.dashboardService.getRecentRuns(organizationId, query);
  }

  @Get('workflow-summary')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get workflow summary with last run info',
    description:
      'Returns a list of all active workflows with their last run status, ' +
      'duration, 24h run counts, and DAG definition for mini preview.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow summary retrieved successfully.',
    type: WorkflowSummaryResponseDto,
  })
  getWorkflowSummary(@Param('organizationId') organizationId: string) {
    return this.dashboardService.getWorkflowSummary(organizationId);
  }
}
