import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WorkflowRunService } from '../workflow-run/workflow-run.service';
import type {
  CreateCronJobInput,
  UpdateCronJobInput,
} from './schemas/cron-job.schema';

@Injectable()
export class CronJobService {
  private readonly logger = new Logger(CronJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runService: WorkflowRunService,
  ) {}

  async create(
    organizationId: string,
    workflowId: string,
    userId: string,
    dto: CreateCronJobInput,
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

    const nextRunAt = this.calculateNextRunAt(dto.cronExpression);

    const cronJob = await this.prisma.cronJob.create({
      data: {
        organizationId,
        workflowId,
        name: dto.name,
        description: dto.description,
        cronExpression: dto.cronExpression,
        timezone: dto.timezone ?? 'UTC',
        nextRunAt,
        createdBy: userId,
      },
    });

    return {
      message: 'Cron job created successfully.',
      data: { cronJob: this.formatCronJob(cronJob) },
    };
  }

  async findAll(
    organizationId: string,
    workflowId: string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;

    const [cronJobs, total] = await this.prisma.$transaction([
      this.prisma.cronJob.findMany({
        where: { organizationId, workflowId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cronJob.count({
        where: { organizationId, workflowId },
      }),
    ]);

    return {
      message: 'Cron jobs retrieved successfully.',
      data: cronJobs.map((cj) => this.formatCronJob(cj)),
      meta: { total, page, limit },
    };
  }

  async update(
    organizationId: string,
    workflowId: string,
    cronJobId: string,
    dto: UpdateCronJobInput,
  ) {
    const cronJob = await this.prisma.cronJob.findFirst({
      where: { id: cronJobId, organizationId, workflowId },
    });

    if (!cronJob) {
      throw new HttpException(
        {
          error: { code: 'CRON_JOB_NOT_FOUND', message: 'Cron job not found.' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.cronExpression !== undefined) {
      updateData.cronExpression = dto.cronExpression;
      updateData.nextRunAt = this.calculateNextRunAt(dto.cronExpression);
    }
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const updated = await this.prisma.cronJob.update({
      where: { id: cronJobId },
      data: updateData,
    });

    return {
      message: 'Cron job updated successfully.',
      data: { cronJob: this.formatCronJob(updated) },
    };
  }

  async remove(organizationId: string, workflowId: string, cronJobId: string) {
    const cronJob = await this.prisma.cronJob.findFirst({
      where: { id: cronJobId, organizationId, workflowId },
    });

    if (!cronJob) {
      throw new HttpException(
        {
          error: { code: 'CRON_JOB_NOT_FOUND', message: 'Cron job not found.' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.cronJob.delete({ where: { id: cronJobId } });

    return { message: 'Cron job deleted successfully.' };
  }

  /**
   * Called by the scheduler to process due cron jobs.
   * Finds all active cron jobs where nextRunAt <= now, triggers runs, and updates nextRunAt.
   */
  async processDueCronJobs(): Promise<void> {
    const now = new Date();

    const dueCronJobs = await this.prisma.cronJob.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
      include: {
        workflow: {
          select: { id: true, activeVersionId: true, deletedAt: true },
        },
      },
    });

    for (const cronJob of dueCronJobs) {
      try {
        // Skip if workflow is deleted or has no active version
        if (cronJob.workflow.deletedAt || !cronJob.workflow.activeVersionId) {
          this.logger.warn(
            `Skipping cron job ${cronJob.id}: workflow has no active version.`,
          );
          continue;
        }

        // Trigger the run
        await this.runService.triggerRun(
          cronJob.organizationId,
          cronJob.workflowId,
          'CRON',
          cronJob.workflow.activeVersionId,
        );

        // Update lastRunAt and nextRunAt
        const nextRunAt = this.calculateNextRunAt(cronJob.cronExpression);

        await this.prisma.cronJob.update({
          where: { id: cronJob.id },
          data: { lastRunAt: now, nextRunAt },
        });

        this.logger.log(
          `Cron job ${cronJob.id} triggered. Next run: ${nextRunAt?.toISOString()}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to process cron job ${cronJob.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  /**
   * Calculate the next run time from a cron expression.
   * Simple implementation — parses minute/hour fields.
   * For production, use a library like `cron-parser`.
   */
  private calculateNextRunAt(cronExpression: string): Date | null {
    try {
      const now = new Date();
      const parts = cronExpression.trim().split(/\s+/);

      if (parts.length < 5) return null;

      const minute = parts[0];
      const hour = parts[1];

      const next = new Date(now);

      if (minute.startsWith('*/')) {
        const step = parseInt(minute.substring(2), 10);
        if (!isNaN(step) && step > 0) {
          const currentMin = next.getMinutes();
          next.setMinutes(currentMin + (step - (currentMin % step)));
          next.setSeconds(0);
          next.setMilliseconds(0);
        }
      } else if (minute !== '*') {
        const parsedMin = parseInt(minute, 10);
        if (!isNaN(parsedMin)) {
          next.setMinutes(parsedMin);
          next.setSeconds(0);
          next.setMilliseconds(0);
        }
      }

      if (hour.startsWith('*/')) {
        const step = parseInt(hour.substring(2), 10);
        if (!isNaN(step) && step > 0) {
          const currentHour = next.getHours();
          next.setHours(currentHour + (step - (currentHour % step)));
        }
      } else if (hour !== '*') {
        const parsedHour = parseInt(hour, 10);
        if (!isNaN(parsedHour)) {
          next.setHours(parsedHour);
        }
      }

      if (isNaN(next.getTime())) {
        return new Date(now.getTime() + 60 * 60 * 1000);
      }

      // If next is in the past, advance by a day
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      return next;
    } catch {
      return null;
    }
  }

  private formatCronJob(cronJob: {
    id: string;
    organizationId: string;
    workflowId: string;
    name: string;
    description: string | null;
    cronExpression: string;
    timezone: string;
    isActive: boolean;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: cronJob.id,
      organizationId: cronJob.organizationId,
      workflowId: cronJob.workflowId,
      name: cronJob.name,
      description: cronJob.description,
      cronExpression: cronJob.cronExpression,
      timezone: cronJob.timezone,
      isActive: cronJob.isActive,
      lastRunAt: cronJob.lastRunAt,
      nextRunAt: cronJob.nextRunAt,
      createdAt: cronJob.createdAt,
      updatedAt: cronJob.updatedAt,
    };
  }
}
