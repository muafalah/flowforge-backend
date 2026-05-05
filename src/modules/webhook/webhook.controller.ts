import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
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
  ApiHeader,
} from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { WebhookService } from './webhook.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrganizationGuardWithParam } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
} from './schemas/webhook.schema';
import {
  createWebhookSchema,
  updateWebhookSchema,
} from './schemas/webhook.schema';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  WebhookCreateResponseDto,
  WebhookListResponseDto,
  WebhookUpdateResponseDto,
  WebhookDeleteResponseDto,
  WebhookTriggerResponseDto,
} from './dto/webhook.dto';

// ── Authenticated CRUD Controller ──
@ApiTags('Webhooks')
@Controller('organizations/:organizationId/workflows/:workflowId/webhooks')
export class WebhookManagementController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a webhook for a workflow' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiBody({ type: CreateWebhookDto })
  @ApiResponse({
    status: 201,
    description: 'Webhook created.',
    type: WebhookCreateResponseDto,
  })
  create(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createWebhookSchema)) dto: CreateWebhookInput,
  ) {
    return this.webhookService.create(
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
  @ApiOperation({ summary: 'List webhooks for a workflow' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiResponse({
    status: 200,
    description: 'Webhooks retrieved.',
    type: WebhookListResponseDto,
  })
  findAll(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.webhookService.findAll(
      organizationId,
      workflowId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Patch(':webhookId')
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a webhook' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiParam({ name: 'webhookId' })
  @ApiBody({ type: UpdateWebhookDto })
  @ApiResponse({
    status: 200,
    description: 'Webhook updated.',
    type: WebhookUpdateResponseDto,
  })
  update(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Param('webhookId') webhookId: string,
    @Body(new ZodValidationPipe(updateWebhookSchema)) dto: UpdateWebhookInput,
  ) {
    return this.webhookService.update(
      organizationId,
      workflowId,
      webhookId,
      dto,
    );
  }

  @Delete(':webhookId')
  @UseGuards(
    JwtAuthGuard,
    OrganizationGuardWithParam('organizationId'),
    RolesGuard,
  )
  @Roles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiParam({ name: 'organizationId' })
  @ApiParam({ name: 'workflowId' })
  @ApiParam({ name: 'webhookId' })
  @ApiResponse({
    status: 200,
    description: 'Webhook deleted.',
    type: WebhookDeleteResponseDto,
  })
  remove(
    @Param('organizationId') organizationId: string,
    @Param('workflowId') workflowId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.webhookService.remove(organizationId, workflowId, webhookId);
  }
}

// ── Public Webhook Receiver ──
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookReceiverController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post(':urlPath')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive a webhook (public)',
    description:
      'Public endpoint. Requires X-Webhook-Secret header for authentication.',
  })
  @ApiParam({
    name: 'urlPath',
    description: 'Unique webhook URL path',
  })
  @ApiHeader({
    name: 'X-Webhook-Secret',
    description: 'Webhook secret for authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed.',
    type: WebhookTriggerResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid secret.',
  })
  @ApiBody({ type: Object, description: 'Webhook payload', required: false })
  receive(
    @Param('urlPath') urlPath: string,
    @Headers('x-webhook-secret') secret: string,
  ) {
    return this.webhookService.handleIncomingWebhook(urlPath, secret ?? '');
  }
}
