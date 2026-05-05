/** Common event payload shape for activity log events. */
export interface ActivityLogEventPayload {
  organizationId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/** All activity log event names. */
export const ACTIVITY_EVENTS = {
  // Members
  MEMBER_ADDED: 'member.added',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_ROLE_UPDATED: 'member.role_updated',
  OWNERSHIP_TRANSFERRED: 'ownership.transferred',

  // Organization
  ORGANIZATION_UPDATED: 'organization.updated',
  ORGANIZATION_DELETED: 'organization.deleted',

  // Workflows
  WORKFLOW_CREATED: 'workflow.created',
  WORKFLOW_UPDATED: 'workflow.updated',
  WORKFLOW_DELETED: 'workflow.deleted',

  // Workflow Versions
  VERSION_CREATED: 'version.created',
  VERSION_ACTIVATED: 'version.activated',

  // Workflow Runs
  RUN_TRIGGERED: 'run.triggered',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',
} as const;

export type ActivityEvent =
  (typeof ACTIVITY_EVENTS)[keyof typeof ACTIVITY_EVENTS];
