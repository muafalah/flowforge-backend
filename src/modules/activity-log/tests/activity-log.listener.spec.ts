import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogListener } from '../activity-log.listener';
import { ActivityLogService } from '../activity-log.service';
import { WorkflowRunGateway } from '../../workflow-execution/workflow-run.gateway';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVITY_EVENTS } from '../activity-log.events';
import type { ActivityLogEventPayload } from '../activity-log.events';

describe('ActivityLogListener', () => {
  let listener: ActivityLogListener;
  let logSpy: jest.Mock;

  beforeEach(async () => {
    logSpy = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogListener,
        {
          provide: ActivityLogService,
          useValue: { log: logSpy },
        },
        {
          provide: WorkflowRunGateway,
          useValue: {
            emitActivityEvent: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn().mockResolvedValue({ name: 'Test User' }),
            },
          },
        },
      ],
    }).compile();

    listener = module.get<ActivityLogListener>(ActivityLogListener);
  });

  const basePayload: ActivityLogEventPayload = {
    organizationId: 'org-1',
    actorId: 'user-1',
    action: 'member.added',
    targetType: 'member',
    targetId: 'member-1',
    targetName: 'john@email.com',
  };

  describe('Member events', () => {
    it('should handle member.added event', async () => {
      const payload = { ...basePayload, action: ACTIVITY_EVENTS.MEMBER_ADDED };
      await listener.handleMemberAdded(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle member.removed event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.MEMBER_REMOVED,
      };
      await listener.handleMemberRemoved(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle member.role_updated event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.MEMBER_ROLE_UPDATED,
        metadata: { oldRole: 'MEMBER', newRole: 'ADMIN' },
      };
      await listener.handleMemberRoleUpdated(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle ownership.transferred event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.OWNERSHIP_TRANSFERRED,
      };
      await listener.handleOwnershipTransferred(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });
  });

  describe('Organization events', () => {
    it('should handle organization.updated event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.ORGANIZATION_UPDATED,
        targetType: 'organization',
      };
      await listener.handleOrganizationUpdated(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle organization.deleted event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.ORGANIZATION_DELETED,
        targetType: 'organization',
      };
      await listener.handleOrganizationDeleted(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });
  });

  describe('Workflow events', () => {
    it('should handle workflow.created event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.WORKFLOW_CREATED,
        targetType: 'workflow',
      };
      await listener.handleWorkflowCreated(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle workflow.updated event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.WORKFLOW_UPDATED,
        targetType: 'workflow',
      };
      await listener.handleWorkflowUpdated(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle workflow.deleted event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.WORKFLOW_DELETED,
        targetType: 'workflow',
      };
      await listener.handleWorkflowDeleted(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });
  });

  describe('Workflow Version events', () => {
    it('should handle version.created event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.VERSION_CREATED,
        targetType: 'version',
      };
      await listener.handleVersionCreated(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle version.activated event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.VERSION_ACTIVATED,
        targetType: 'version',
      };
      await listener.handleVersionActivated(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });
  });

  describe('Workflow Run events', () => {
    it('should handle run.triggered event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.RUN_TRIGGERED,
        targetType: 'run',
      };
      await listener.handleRunTriggered(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle run.completed event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.RUN_COMPLETED,
        targetType: 'run',
      };
      await listener.handleRunCompleted(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle run.failed event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.RUN_FAILED,
        targetType: 'run',
      };
      await listener.handleRunFailed(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });

    it('should handle run.cancelled event', async () => {
      const payload = {
        ...basePayload,
        action: ACTIVITY_EVENTS.RUN_CANCELLED,
        targetType: 'run',
      };
      await listener.handleRunCancelled(payload);
      expect(logSpy).toHaveBeenCalledWith(payload);
    });
  });
});
