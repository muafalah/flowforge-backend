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
import { CronJobService } from './cron-job.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type {
  CreateCronJobInput,
  UpdateCronJobInput,
} from './schemas/cron-job.schema';
import {
  createCronJobSchema,
  updateCronJobSchema,
} from './schemas/cron-job.schema';
import {
  CreateCronJobDto,
  UpdateCronJobDto,
  CronJobCreateResponseDto,
  CronJobListResponseDto,
  CronJobUpdateResponseDto,
  CronJobDeleteResponseDto,
} from './dto/cron-job.dto';

@ApiTags('Cron Jobs')
@Controller('organizations/:organizationId/workflows/:workflowId/cron-jobs')
export class CronJobController {
  constructor(private readonly cronJobService: CronJobService) {}

  @Post()
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a cron job for a workflow' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiBody({ type: CreateCronJobDto })
  @ApiResponse({
    status: 201,
    description: 'Cron job created.',
    type: CronJobCreateResponseDto,
  })
  create(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCronJobSchema)) dto: CreateCronJobInput,
  ) {
    return this.cronJobService.create(
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
  @ApiOperation({ summary: 'List cron jobs for a workflow' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiResponse({
    status: 200,
    description: 'Cron jobs retrieved.',
    type: CronJobListResponseDto,
  })
  findAll(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.cronJobService.findAll(
      organizationId,
      workflowId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Patch(':cronJobId')
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a cron job' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiParam({ name: 'cronJobId' })
  @ApiBody({ type: UpdateCronJobDto })
  @ApiResponse({
    status: 200,
    description: 'Cron job updated.',
    type: CronJobUpdateResponseDto,
  })
  update(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Param('cronJobId') cronJobId: string,
    @Body(new ZodValidationPipe(updateCronJobSchema)) dto: UpdateCronJobInput,
  ) {
    return this.cronJobService.update(
      organizationId,
      workflowId,
      cronJobId,
      dto,
    );
  }

  @Delete(':cronJobId')
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a cron job' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiParam({ name: 'cronJobId' })
  @ApiResponse({
    status: 200,
    description: 'Cron job deleted.',
    type: CronJobDeleteResponseDto,
  })
  remove(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Param('cronJobId') cronJobId: string,
  ) {
    return this.cronJobService.remove(organizationId, workflowId, cronJobId);
  }
}
