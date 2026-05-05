import {
  Controller,
  Post,
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
import { WorkflowRunService } from './workflow-run.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type {
  RunQueryParamsInput,
  LogQueryParamsInput,
} from './schemas/run-query-params.schema';
import {
  runQueryParamsSchema,
  logQueryParamsSchema,
} from './schemas/run-query-params.schema';
import {
  RunTriggerResponseDto,
  RunListResponseDto,
  RunDetailResponseDto,
  RunCancelResponseDto,
  RunLogsResponseDto,
} from './dto/run-response.dto';

@ApiTags('Workflow Runs')
@Controller('organizations/:organizationId/workflows/:workflowId/runs')
export class WorkflowRunController {
  constructor(private readonly runService: WorkflowRunService) {}

  @Post()
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Trigger a manual workflow run',
    description:
      'Triggers a new workflow run using the active version. ' +
      'The run is queued and executed asynchronously.',
  })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'workflowId',
    description: 'UUID of the workflow',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 201,
    description: 'Run triggered successfully.',
    type: RunTriggerResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'No active version.',
    schema: {
      example: {
        error: {
          code: 'NO_ACTIVE_VERSION',
          message: 'Workflow has no active version.',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow not found.',
    schema: {
      example: {
        error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found.' },
      },
    },
  })
  triggerRun(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.runService.triggerManualRun(
      organizationId,
      workflowId,
      user.userId,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List workflow runs' })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
  })
  @ApiParam({
    name: 'workflowId',
    description: 'UUID of the workflow',
  })
  @ApiResponse({
    status: 200,
    description: 'Runs retrieved successfully.',
    type: RunListResponseDto,
  })
  findAll(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(runQueryParamsSchema))
    query: RunQueryParamsInput,
  ) {
    return this.runService.findAll(organizationId, workflowId, query);
  }

  @Get(':runId')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get workflow run details',
    description: 'Returns the run with all its step results.',
  })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiParam({
    name: 'runId',
    description: 'UUID of the workflow run',
  })
  @ApiResponse({
    status: 200,
    description: 'Run retrieved successfully.',
    type: RunDetailResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Run not found.',
    schema: {
      example: {
        error: { code: 'RUN_NOT_FOUND', message: 'Workflow run not found.' },
      },
    },
  })
  findOne(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
  ) {
    return this.runService.findOne(organizationId, workflowId, runId);
  }

  @Post(':runId/cancel')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a running workflow' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiParam({ name: 'runId' })
  @ApiResponse({
    status: 200,
    description: 'Cancellation requested.',
    type: RunCancelResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Run is not cancellable.',
    schema: {
      example: {
        error: {
          code: 'RUN_NOT_CANCELLABLE',
          message: 'Cannot cancel a run with status: SUCCESS',
        },
      },
    },
  })
  cancel(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.runService.cancel(
      organizationId,
      workflowId,
      runId,
      user.userId,
    );
  }

  @Get(':runId/logs')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get execution logs for a run',
    description: 'Returns execution logs from Elasticsearch with filtering.',
  })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiParam({ name: 'runId' })
  @ApiResponse({
    status: 200,
    description: 'Logs retrieved successfully.',
    type: RunLogsResponseDto,
  })
  getLogs(
    @Param('runId') runId: string,
    @Query(new ZodValidationPipe(logQueryParamsSchema))
    query: LogQueryParamsInput,
  ) {
    return this.runService.getLogs(runId, query);
  }
}
