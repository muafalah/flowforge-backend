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
import { WorkflowService } from './workflow.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkflowAccessGuard } from '../../common/guards/workflow-access.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createWorkflowSchema,
  type CreateWorkflowInput,
} from './schemas/create-workflow.schema';
import { updateWorkflowSchema } from './schemas/update-workflow.schema';
import { workflowQueryParamsSchema } from './schemas/workflow-query-params.schema';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowQueryParamsDto } from './dto/workflow-query-params.dto';
import {
  WorkflowListResponseDto,
  WorkflowDetailResponseDto,
  WorkflowCreateResponseDto,
  WorkflowUpdateResponseDto,
  WorkflowDeleteResponseDto,
} from './dto/workflow-response.dto';

@ApiTags('Workflows')
@Controller('organizations/:organizationId/workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: CreateWorkflowDto })
  @ApiResponse({
    status: 201,
    description: 'Workflow created successfully.',
    type: WorkflowCreateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error.',
    schema: {
      example: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data.',
          fields: { name: 'Workflow name must be at least 3 characters.' },
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
  create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createWorkflowSchema)) dto: CreateWorkflowInput,
  ) {
    return this.workflowService.create(organizationId, user.userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List workflows in an organization' })
  @ApiParam({
    name: 'organizationId',
    description: 'UUID of the organization',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflows retrieved successfully.',
    type: WorkflowListResponseDto,
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
  findAll(
    @Param('organizationId') organizationId: string,
    @Query(new ZodValidationPipe(workflowQueryParamsSchema))
    query: WorkflowQueryParamsDto,
  ) {
    return this.workflowService.findAll(organizationId, query);
  }

  @Get(':workflowId')
  @UseGuards(JwtAuthGuard, OrganizationGuardWithParam('organizationId'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get workflow details' })
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
    description: 'Workflow retrieved successfully.',
    type: WorkflowDetailResponseDto,
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
  findOne(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowService.findOne(organizationId, workflowId);
  }

  @Patch(':workflowId')
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    WorkflowAccessGuard('organizationId', 'workflowId'),
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a workflow' })
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
  @ApiBody({ type: UpdateWorkflowDto })
  @ApiResponse({
    status: 200,
    description: 'Workflow updated successfully.',
    type: WorkflowUpdateResponseDto,
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
  update(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Body(new ZodValidationPipe(updateWorkflowSchema)) dto: UpdateWorkflowDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.update(
      organizationId,
      workflowId,
      dto,
      user.userId,
    );
  }

  @Delete(':workflowId')
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    WorkflowAccessGuard('organizationId', 'workflowId'),
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a workflow' })
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
    description: 'Workflow deleted successfully.',
    type: WorkflowDeleteResponseDto,
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
  remove(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.workflowService.softDelete(
      organizationId,
      workflowId,
      user.userId,
    );
  }
}
