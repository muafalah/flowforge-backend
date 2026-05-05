import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityLogService } from './activity-log.service';
import { WorkflowRunGateway } from '../workflow-execution/workflow-run.gateway';
import {
  ACTIVITY_EVENTS,
  type ActivityLogEventPayload,
} from './activity-log.events';
import { PrismaService } from '../../database/prisma.service';

/**
 * Listens to domain events emitted by other services and
 * delegates to ActivityLogService to persist the log entry.
 *
 * All handlers are async — they run in the background and
 * never block the originating request.
 */
@Injectable()
export class ActivityLogListener {
  private readonly logger = new Logger(ActivityLogListener.name);

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly runGateway: WorkflowRunGateway,
    private readonly prisma: PrismaService,
  ) {}

  /** Helper to persist log + emit WebSocket activity event */
  private async logAndEmit(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);

    // Resolve actor name for the real-time feed
    let actorName: string | undefined;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.actorId },
        select: { name: true },
      });
      actorName = user?.name ?? undefined;
    } catch {
      // Non-critical — proceed without actor name
    }

    // Emit to org-level activity feed WebSocket room
    try {
      this.runGateway.emitActivityEvent(payload.organizationId, {
        action: payload.action,
        targetType: payload.targetType,
        targetId: payload.targetId,
        targetName: payload.targetName,
        actorName,
        metadata: payload.metadata,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Failed to emit activity WS event: ${err}`);
    }
  }

  // ── Members ──────────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.MEMBER_ADDED)
  async handleMemberAdded(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.MEMBER_REMOVED)
  async handleMemberRemoved(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.MEMBER_ROLE_UPDATED)
  async handleMemberRoleUpdated(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.OWNERSHIP_TRANSFERRED)
  async handleOwnershipTransferred(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  // ── Organization ─────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.ORGANIZATION_UPDATED)
  async handleOrganizationUpdated(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.ORGANIZATION_DELETED)
  async handleOrganizationDeleted(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  // ── Workflows ────────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.WORKFLOW_CREATED)
  async handleWorkflowCreated(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.WORKFLOW_UPDATED)
  async handleWorkflowUpdated(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.WORKFLOW_DELETED)
  async handleWorkflowDeleted(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  // ── Workflow Versions ────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.VERSION_CREATED)
  async handleVersionCreated(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.VERSION_ACTIVATED)
  async handleVersionActivated(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  // ── Workflow Runs ────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.RUN_TRIGGERED)
  async handleRunTriggered(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.RUN_COMPLETED)
  async handleRunCompleted(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.RUN_FAILED)
  async handleRunFailed(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.RUN_CANCELLED)
  async handleRunCancelled(payload: ActivityLogEventPayload) {
    await this.logAndEmit(payload);
  }
}
