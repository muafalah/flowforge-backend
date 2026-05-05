import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { RecentRunsQueryParamsInput } from './schemas/dashboard-query-params.schema';

export interface HourlyRunData {
  hour: string;
  success: number;
  failed: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get aggregated dashboard statistics for an organization.
   */
  async getStats(organizationId: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      activeRuns,
      totalRuns24h,
      successCount24h,
      failedCount24h,
      avgDurationResult,
      totalWorkflows,
    ] = await this.prisma.$transaction([
      // Active runs (PENDING or RUNNING)
      this.prisma.workflowRun.count({
        where: {
          organizationId,
          status: { in: ['PENDING', 'RUNNING'] },
        },
      }),
      // Total runs in last 24h
      this.prisma.workflowRun.count({
        where: {
          organizationId,
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      // Success count in last 24h
      this.prisma.workflowRun.count({
        where: {
          organizationId,
          status: 'SUCCESS',
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      // Failed count in last 24h
      this.prisma.workflowRun.count({
        where: {
          organizationId,
          status: 'FAILED',
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      // Average duration in last 24h
      this.prisma.workflowRun.aggregate({
        where: {
          organizationId,
          finishedAt: { gte: twentyFourHoursAgo },
          durationMs: { not: null },
        },
        _avg: { durationMs: true },
      }),
      // Total active workflows
      this.prisma.workflow.count({
        where: {
          organizationId,
          deletedAt: null,
        },
      }),
    ]);

    const avgDurationMs24h = avgDurationResult._avg.durationMs ?? 0;
    const successRate24h =
      totalRuns24h > 0
        ? Math.round((successCount24h / totalRuns24h) * 1000) / 10
        : 0;

    // Hourly sparkline data for the past 24 hours
    const hourlyRuns = await this.getHourlyRunData(
      organizationId,
      twentyFourHoursAgo,
    );

    return {
      message: 'Dashboard stats retrieved successfully.',
      data: {
        activeRuns,
        totalRuns24h,
        successCount24h,
        failedCount24h,
        successRate24h,
        avgDurationMs24h: Math.round(avgDurationMs24h),
        totalWorkflows,
        hourlyRuns,
      },
    };
  }

  /**
   * Get cross-workflow recent runs with workflow names.
   */
  async getRecentRuns(
    organizationId: string,
    query: RecentRunsQueryParamsInput,
  ) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(status ? { status } : {}),
    };

    const [runs, total] = await this.prisma.$transaction([
      this.prisma.workflowRun.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          workflow: { select: { id: true, name: true } },
          triggeredUser: { select: { id: true, name: true } },
        },
      }),
      this.prisma.workflowRun.count({ where }),
    ]);

    return {
      message: 'Recent runs retrieved successfully.',
      data: runs.map((run) => ({
        id: run.id,
        workflowId: run.workflow.id,
        workflowName: run.workflow.name,
        status: run.status,
        triggerType: run.triggerType,
        triggeredBy: run.triggeredBy,
        triggeredUserName: run.triggeredUser?.name ?? null,
        durationMs: run.durationMs,
        startedAt: run.startedAt?.toISOString() ?? null,
        createdAt: run.createdAt.toISOString(),
      })),
      meta: { total, page, limit },
    };
  }

  /**
   * Get per-workflow summary with last run info and DAG definition.
   */
  async getWorkflowSummary(organizationId: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const workflows = await this.prisma.workflow.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        activeVersion: {
          select: { definition: true },
        },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            durationMs: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            runs: {
              where: {
                createdAt: { gte: twentyFourHoursAgo },
              },
            },
          },
        },
      },
    });

    // Get success counts per workflow for 24h (separate query for accuracy)
    const workflowIds = workflows.map((w) => w.id);
    const successCounts = await this.prisma.workflowRun.groupBy({
      by: ['workflowId'],
      where: {
        organizationId,
        workflowId: { in: workflowIds },
        status: 'SUCCESS',
        createdAt: { gte: twentyFourHoursAgo },
      },
      _count: { id: true },
    });

    const successMap = new Map(
      successCounts.map((sc) => [sc.workflowId, sc._count.id]),
    );

    return {
      message: 'Workflow summary retrieved successfully.',
      data: workflows.map((workflow) => {
        const lastRun = workflow.runs[0] ?? null;
        return {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          lastRunStatus: lastRun?.status ?? null,
          lastRunDuration: lastRun?.durationMs ?? null,
          lastRunAt: lastRun?.createdAt?.toISOString() ?? null,
          totalRuns24h: workflow._count.runs,
          successCount24h: successMap.get(workflow.id) ?? 0,
          activeVersionDefinition: workflow.activeVersion?.definition ?? null,
        };
      }),
    };
  }

  // ─── Private helpers ───

  /**
   * Get hourly run counts for sparkline data.
   * Uses raw SQL for date_trunc grouping.
   */
  private async getHourlyRunData(
    organizationId: string,
    since: Date,
  ): Promise<HourlyRunData[]> {
    try {
      const result = await this.prisma.$queryRaw<
        Array<{
          hour: Date;
          success_count: bigint;
          failed_count: bigint;
        }>
      >`
        SELECT
          date_trunc('hour', created_at) AS hour,
          COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success_count,
          COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_count
        FROM workflow_runs
        WHERE organization_id = ${organizationId}
          AND created_at >= ${since}
        GROUP BY date_trunc('hour', created_at)
        ORDER BY hour ASC
      `;

      // Fill in missing hours with zeros
      const hourlyMap = new Map<string, HourlyRunData>();
      const now = new Date();
      for (let i = 23; i >= 0; i--) {
        const hour = new Date(now);
        hour.setMinutes(0, 0, 0);
        hour.setHours(hour.getHours() - i);
        const key = hour.toISOString();
        hourlyMap.set(key, { hour: key, success: 0, failed: 0 });
      }

      for (const row of result) {
        const hourDate = new Date(row.hour);
        hourDate.setMinutes(0, 0, 0);
        const key = hourDate.toISOString();
        if (hourlyMap.has(key)) {
          hourlyMap.set(key, {
            hour: key,
            success: Number(row.success_count),
            failed: Number(row.failed_count),
          });
        }
      }

      return Array.from(hourlyMap.values());
    } catch {
      // Fallback: return empty 24-hour array if raw query fails
      const hours: HourlyRunData[] = [];
      const now = new Date();
      for (let i = 23; i >= 0; i--) {
        const hour = new Date(now);
        hour.setMinutes(0, 0, 0);
        hour.setHours(hour.getHours() - i);
        hours.push({ hour: hour.toISOString(), success: 0, failed: 0 });
      }
      return hours;
    }
  }
}
