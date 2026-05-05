import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { ActivityLogEventPayload } from './activity-log.events';
import type { ActivityLogQueryParamsInput } from './schemas/activity-log-query-params.schema';

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an activity log entry to the database.
   * This is called by the event listener — failures are caught
   * and logged so they never affect the main request flow.
   */
  async log(payload: ActivityLogEventPayload): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          organizationId: payload.organizationId,
          actorId: payload.actorId,
          action: payload.action,
          targetType: payload.targetType,
          targetId: payload.targetId,
          targetName: payload.targetName,
          metadata: (payload.metadata as Prisma.InputJsonValue) ?? undefined,
          ipAddress: payload.ipAddress,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write activity log [${payload.action}]: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Query activity logs for an organization with filters and pagination.
   */
  async findAll(organizationId: string, query: ActivityLogQueryParamsInput) {
    const {
      page,
      limit,
      search,
      action,
      actorId,
      targetType,
      startDate,
      endDate,
      sortOrder,
    } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organizationId,
      ...(action ? { action } : {}),
      ...(actorId ? { actorId } : {}),
      ...(targetType ? { targetType } : {}),
      ...(search
        ? {
            targetName: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      message: 'Activity logs retrieved successfully.',
      data: logs.map((log) => ({
        id: log.id,
        organizationId: log.organizationId,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        targetName: log.targetName,
        metadata: log.metadata as Record<string, unknown> | null,
        actor: {
          id: log.actor.id,
          name: log.actor.name,
          email: log.actor.email,
        },
        createdAt: log.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
      },
    };
  }
}
