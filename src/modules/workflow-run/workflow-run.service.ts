import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { WorkflowExecutionService } from '../workflow-execution/workflow-execution.service';
import {
  ACTIVITY_EVENTS,
  type ActivityLogEventPayload,
} from '../activity-log/activity-log.events';
import type {
  RunQueryParamsInput,
  LogQueryParamsInput,
} from './schemas/run-query-params.schema';
import type { WorkflowRunJobData } from '../workflow-execution/types';

@Injectable()
export class WorkflowRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly executionService: WorkflowExecutionService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('workflow-execution')
    private readonly executionQueue: Queue<WorkflowRunJobData>,
  ) {}

  /** Emit an activity log event (fire-and-forget). */
  private emitActivity(payload: ActivityLogEventPayload): void {
    this.eventEmitter.emit(payload.action, payload);
  }

  /**
   * Trigger a manual workflow run.
   * Uses the workflow's active version.
   */
  async triggerManualRun(
    organizationId: string,
    workflowId: string,
    userId: string,
  ) {
    // Verify workflow exists
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, organizationId, deletedAt: null },
      include: { activeVersion: true },
    });

    if (!workflow) {
      throw new HttpException(
        {
          error: { code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found.' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!workflow.activeVersionId || !workflow.activeVersion) {
      throw new HttpException(
        {
          error: {
            code: 'NO_ACTIVE_VERSION',
            message:
              'Workflow has no active version. Please activate a version first.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Create run record
    const run = await this.prisma.workflowRun.create({
      data: {
        organizationId,
        workflowId,
        workflowVersionId: workflow.activeVersionId,
        status: 'PENDING',
        triggerType: 'MANUAL',
        triggeredBy: userId,
      },
    });

    // Enqueue execution job
    const jobData: WorkflowRunJobData = {
      runId: run.id,
      organizationId,
      workflowId,
      workflowVersionId: workflow.activeVersionId,
      triggeredBy: userId,
      triggerType: 'MANUAL',
    };

    await this.executionQueue.add('execute-workflow', jobData, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    this.emitActivity({
      organizationId,
      actorId: userId,
      action: ACTIVITY_EVENTS.RUN_TRIGGERED,
      targetType: 'run',
      targetId: run.id,
      targetName: workflow.name,
      metadata: { triggerType: 'MANUAL', workflowId },
    });

    return {
      message: 'Workflow run triggered successfully.',
      data: {
        run: {
          id: run.id,
          organizationId: run.organizationId,
          workflowId: run.workflowId,
          workflowVersionId: run.workflowVersionId,
          status: run.status,
          triggerType: run.triggerType,
          triggeredBy: run.triggeredBy,
          createdAt: run.createdAt,
        },
      },
    };
  }

  /**
   * Trigger a run from a specific trigger type (used by cron/webhook).
   */
  async triggerRun(
    organizationId: string,
    workflowId: string,
    triggerType: 'CRON' | 'WEBHOOK',
    activeVersionId: string,
    triggeredBy?: string,
  ) {
    const run = await this.prisma.workflowRun.create({
      data: {
        organizationId,
        workflowId,
        workflowVersionId: activeVersionId,
        status: 'PENDING',
        triggerType,
        triggeredBy,
      },
    });

    const jobData: WorkflowRunJobData = {
      runId: run.id,
      organizationId,
      workflowId,
      workflowVersionId: activeVersionId,
      triggeredBy,
      triggerType,
    };

    await this.executionQueue.add('execute-workflow', jobData, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    return run;
  }

  /** List runs for a workflow with pagination and filters */
  async findAll(
    organizationId: string,
    workflowId: string,
    query: RunQueryParamsInput,
  ) {
    const { page, limit, status, triggerType, sortOrder } = query;
    const skip = (page - 1) * limit;

    // Verify workflow exists
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

    const where = {
      organizationId,
      workflowId,
      ...(status
        ? {
            status: status,
          }
        : {}),
      ...(triggerType ? { triggerType: triggerType } : {}),
    };

    const [runs, total] = await this.prisma.$transaction([
      this.prisma.workflowRun.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        include: {
          triggeredUser: { select: { id: true, name: true, email: true } },
          version: { select: { version: true } },
        },
      }),
      this.prisma.workflowRun.count({ where }),
    ]);

    return {
      message: 'Runs retrieved successfully.',
      data: runs.map((run) => ({
        id: run.id,
        organizationId: run.organizationId,
        workflowId: run.workflowId,
        workflowVersionId: run.workflowVersionId,
        versionNumber: run.version.version,
        status: run.status,
        triggerType: run.triggerType,
        triggeredBy: run.triggeredBy,
        triggeredUser: run.triggeredUser,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationMs: run.durationMs,
        createdAt: run.createdAt,
      })),
      meta: { total, page, limit },
    };
  }

  /** Get a single run with all its steps */
  async findOne(organizationId: string, workflowId: string, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, organizationId, workflowId },
      include: {
        triggeredUser: { select: { id: true, name: true, email: true } },
        version: { select: { version: true } },
        steps: { orderBy: { executionOrder: 'asc' } },
      },
    });

    if (!run) {
      throw new HttpException(
        {
          error: { code: 'RUN_NOT_FOUND', message: 'Workflow run not found.' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      message: 'Run retrieved successfully.',
      data: {
        run: {
          id: run.id,
          organizationId: run.organizationId,
          workflowId: run.workflowId,
          workflowVersionId: run.workflowVersionId,
          versionNumber: run.version.version,
          status: run.status,
          triggerType: run.triggerType,
          triggeredBy: run.triggeredBy,
          triggeredUser: run.triggeredUser,
          errorMessage: run.errorMessage,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          durationMs: run.durationMs,
          createdAt: run.createdAt,
          steps: run.steps.map((step) => ({
            id: step.id,
            nodeId: step.nodeId,
            name: step.name,
            description: step.description,
            type: step.type,
            status: step.status,
            input: step.input,
            output: step.output,
            error: step.error,
            retryCount: step.retryCount,
            executionOrder: step.executionOrder,
            durationMs: step.durationMs,
            startedAt: step.startedAt,
            finishedAt: step.finishedAt,
          })),
        },
      },
    };
  }

  /** Cancel a running workflow */
  async cancel(
    organizationId: string,
    workflowId: string,
    runId: string,
    userId: string,
  ) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, organizationId, workflowId },
    });

    if (!run) {
      throw new HttpException(
        {
          error: { code: 'RUN_NOT_FOUND', message: 'Workflow run not found.' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (run.status !== 'PENDING' && run.status !== 'RUNNING') {
      throw new HttpException(
        {
          error: {
            code: 'RUN_NOT_CANCELLABLE',
            message: `Cannot cancel a run with status: ${run.status}`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Signal abort to execution service
    this.executionService.cancelRun(runId);

    // Update status
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });

    this.emitActivity({
      organizationId,
      actorId: userId,
      action: ACTIVITY_EVENTS.RUN_CANCELLED,
      targetType: 'run',
      targetId: runId,
      metadata: { workflowId },
    });

    return { message: 'Run cancellation requested.' };
  }

  /**
   * Emit a run status event. Called by the execution engine
   * when a run completes, fails, or is cancelled.
   */
  emitRunStatusEvent(
    organizationId: string,
    workflowId: string,
    runId: string,
    workflowName: string,
    status: 'completed' | 'failed',
    actorId: string,
    metadata?: Record<string, unknown>,
  ) {
    const action =
      status === 'completed'
        ? ACTIVITY_EVENTS.RUN_COMPLETED
        : ACTIVITY_EVENTS.RUN_FAILED;

    this.emitActivity({
      organizationId,
      actorId,
      action,
      targetType: 'run',
      targetId: runId,
      targetName: workflowName,
      metadata: { workflowId, ...metadata },
    });
  }

  /** Get execution logs from Elasticsearch */
  async getLogs(runId: string, query: LogQueryParamsInput) {
    const { nodeId, level, page, limit } = query;
    const from = (page - 1) * limit;

    const result = await this.elasticsearchService.queryLogs({
      runId,
      nodeId,
      level,
      from,
      size: limit,
    });

    return {
      message: 'Logs retrieved successfully.',
      data: result.logs,
      meta: { total: result.total, page, limit },
    };
  }
}
