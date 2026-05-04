import {
  Controller,
  Post,
  Get,
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
import { WorkflowVersionService } from './workflow-version.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { WorkflowAccessGuard } from '../../common/guards/workflow-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createVersionSchema } from './schemas/create-version.schema';
import { versionQueryParamsSchema } from './schemas/workflow-query-params.schema';
import { CreateVersionDto } from './dto/create-version.dto';
import { VersionQueryParamsDto } from './dto/workflow-query-params.dto';
import {
  VersionListResponseDto,
  VersionCreateResponseDto,
  VersionActivateResponseDto,
} from './dto/workflow-version-response.dto';

@ApiTags('Workflow Versions')
@Controller('organizations/:organizationId/workflows/:workflowId/versions')
export class WorkflowVersionController {
  constructor(
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  @Post()
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    WorkflowAccessGuard('organizationId', 'workflowId'),
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new workflow version',
    description:
      'Creates a new version with an auto-incremented version number. ' +
      'Validates the DAG definition for structure, node uniqueness, edge references, ' +
      'and acyclicity. Returns the topological execution order on success.',
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
  @ApiBody({ type: CreateVersionDto })
  @ApiResponse({
    status: 201,
    description: 'Version created successfully.',
    type: VersionCreateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid DAG definition.',
    schema: {
      example: {
        error: {
          code: 'INVALID_DAG',
          message: 'Invalid workflow definition.',
          details: ['Cycle detected: step1 → step2 → step1.'],
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
    description: 'Workflow not found.',
    schema: {
      example: {
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: 'Workflow not found.',
        },
      },
    },
  })
  createVersion(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createVersionSchema)) dto: CreateVersionDto,
  ) {
    return this.workflowVersionService.createVersion(
      organizationId,
      workflowId,
      user.userId,
      dto,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List versions of a workflow' })
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
    status: 200,
    description: 'Versions retrieved successfully.',
    type: VersionListResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Workflow not found.',
    schema: {
      example: {
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: 'Workflow not found.',
        },
      },
    },
  })
  findAllVersions(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Query(new ZodValidationPipe(versionQueryParamsSchema))
    query: VersionQueryParamsDto,
  ) {
    return this.workflowVersionService.findAllVersions(
      organizationId,
      workflowId,
      query,
    );
  }

  @Post(':versionId/activate')
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    WorkflowAccessGuard('organizationId', 'workflowId'),
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a specific version',
    description:
      'Activates the specified version and deactivates all others in a transaction. ' +
      "Also updates the workflow's active_version_id pointer.",
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
  @ApiParam({
    name: 'versionId',
    description: 'UUID of the version to activate',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  @ApiResponse({
    status: 200,
    description: 'Version activated successfully.',
    type: VersionActivateResponseDto,
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
    description: 'Workflow or version not found.',
    schema: {
      example: {
        error: {
          code: 'VERSION_NOT_FOUND',
          message: 'Workflow version not found.',
        },
      },
    },
  })
  activateVersion(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflowVersionService.activateVersion(
      organizationId,
      workflowId,
      versionId,
    );
  }
}
