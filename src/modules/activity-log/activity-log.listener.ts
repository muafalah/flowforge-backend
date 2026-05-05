import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityLogService } from './activity-log.service';
import {
  ACTIVITY_EVENTS,
  type ActivityLogEventPayload,
} from './activity-log.events';

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

  constructor(private readonly activityLogService: ActivityLogService) {}

  // ── Members ──────────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.MEMBER_ADDED)
  async handleMemberAdded(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.MEMBER_REMOVED)
  async handleMemberRemoved(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.MEMBER_ROLE_UPDATED)
  async handleMemberRoleUpdated(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.OWNERSHIP_TRANSFERRED)
  async handleOwnershipTransferred(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  // ── Organization ─────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.ORGANIZATION_UPDATED)
  async handleOrganizationUpdated(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.ORGANIZATION_DELETED)
  async handleOrganizationDeleted(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  // ── Workflows ────────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.WORKFLOW_CREATED)
  async handleWorkflowCreated(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.WORKFLOW_UPDATED)
  async handleWorkflowUpdated(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.WORKFLOW_DELETED)
  async handleWorkflowDeleted(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  // ── Workflow Versions ────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.VERSION_CREATED)
  async handleVersionCreated(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.VERSION_ACTIVATED)
  async handleVersionActivated(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  // ── Workflow Runs ────────────────────────────────────────

  @OnEvent(ACTIVITY_EVENTS.RUN_TRIGGERED)
  async handleRunTriggered(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.RUN_COMPLETED)
  async handleRunCompleted(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.RUN_FAILED)
  async handleRunFailed(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }

  @OnEvent(ACTIVITY_EVENTS.RUN_CANCELLED)
  async handleRunCancelled(payload: ActivityLogEventPayload) {
    this.logger.debug(`Event: ${payload.action}`);
    await this.activityLogService.log(payload);
  }
}
