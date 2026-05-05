import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { WorkflowRunService } from '../workflow-run/workflow-run.service';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
} from './schemas/webhook.schema';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly runService: WorkflowRunService,
  ) {}

  async create(
    organizationId: string,
    workflowId: string,
    userId: string,
    dto: CreateWebhookInput,
  ) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, organizationId, deletedAt: null },
    });

    if (!workflow) {
      throw new HttpException(
        {
          error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found.' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const secret = this.generateSecret();
    const urlPath = this.generateUrlPath();

    const webhook = await this.prisma.webhookTrigger.create({
      data: {
        organizationId,
        workflowId,
        name: dto.name,
        description: dto.description,
        secret,
        urlPath,
        createdBy: userId,
      },
    });

    return {
      message: 'Webhook created successfully.',
      data: { webhook: this.formatWebhook(webhook) },
    };
  }

  async findAll(
    organizationId: string,
    workflowId: string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;

    const [webhooks, total] = await this.prisma.$transaction([
      this.prisma.webhookTrigger.findMany({
        where: { organizationId, workflowId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.webhookTrigger.count({
        where: { organizationId, workflowId },
      }),
    ]);

    return {
      message: 'Webhooks retrieved successfully.',
      data: webhooks.map((wh) => this.formatWebhook(wh)),
      meta: { total, page, limit },
    };
  }

  async update(
    organizationId: string,
    workflowId: string,
    webhookId: string,
    dto: UpdateWebhookInput,
  ) {
    const webhook = await this.prisma.webhookTrigger.findFirst({
      where: { id: webhookId, organizationId, workflowId },
    });

    if (!webhook) {
      throw new HttpException(
        { error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook not found.' } },
        HttpStatus.NOT_FOUND,
      );
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.regenerateSecret) updateData.secret = this.generateSecret();

    const updated = await this.prisma.webhookTrigger.update({
      where: { id: webhookId },
      data: updateData,
    });

    return {
      message: 'Webhook updated successfully.',
      data: { webhook: this.formatWebhook(updated) },
    };
  }

  async remove(organizationId: string, workflowId: string, webhookId: string) {
    const webhook = await this.prisma.webhookTrigger.findFirst({
      where: { id: webhookId, organizationId, workflowId },
    });

    if (!webhook) {
      throw new HttpException(
        { error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook not found.' } },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.webhookTrigger.delete({ where: { id: webhookId } });

    return { message: 'Webhook deleted successfully.' };
  }

  /**
   * Handle an incoming webhook request (public endpoint).
   * Validates the secret and triggers a workflow run.
   */
  async handleIncomingWebhook(urlPath: string, secret: string) {
    const webhook = await this.prisma.webhookTrigger.findUnique({
      where: { urlPath },
      include: {
        workflow: {
          select: {
            id: true,
            organizationId: true,
            activeVersionId: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!webhook) {
      throw new HttpException(
        { error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook not found.' } },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!webhook.isActive) {
      throw new HttpException(
        {
          error: {
            code: 'WEBHOOK_INACTIVE',
            message: 'This webhook is inactive.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Validate secret
    if (webhook.secret !== secret) {
      throw new HttpException(
        {
          error: { code: 'INVALID_SECRET', message: 'Invalid webhook secret.' },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Check workflow
    if (webhook.workflow.deletedAt || !webhook.workflow.activeVersionId) {
      throw new HttpException(
        {
          error: {
            code: 'NO_ACTIVE_VERSION',
            message: 'Workflow has no active version.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Trigger the run
    const run = await this.runService.triggerRun(
      webhook.workflow.organizationId,
      webhook.workflow.id,
      'WEBHOOK',
      webhook.workflow.activeVersionId,
    );

    this.logger.log(`Webhook ${webhook.id} triggered run ${run.id}`);

    return {
      message: 'Webhook received. Run triggered.',
      runId: run.id,
    };
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  private generateUrlPath(): string {
    return randomUUID().replace(/-/g, '');
  }

  private formatWebhook(webhook: {
    id: string;
    organizationId: string;
    workflowId: string;
    name: string;
    description: string | null;
    secret: string;
    urlPath: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const baseUrl =
      this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return {
      id: webhook.id,
      organizationId: webhook.organizationId,
      workflowId: webhook.workflowId,
      name: webhook.name,
      description: webhook.description,
      secret: webhook.secret,
      urlPath: webhook.urlPath,
      webhookUrl: `${baseUrl}/v1/webhooks/${webhook.urlPath}`,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };
  }
}
