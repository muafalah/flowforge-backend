import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogService } from '../activity-log.service';
import { PrismaService } from '../../../database/prisma.service';
import type { ActivityLogEventPayload } from '../activity-log.events';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let prisma: {
    activityLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      activityLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ActivityLogService>(ActivityLogService);
  });

  describe('log', () => {
    const payload: ActivityLogEventPayload = {
      organizationId: 'org-1',
      actorId: 'user-1',
      action: 'member.added',
      targetType: 'member',
      targetId: 'member-1',
      targetName: 'john@email.com',
      metadata: { role: 'MEMBER' },
    };

    it('should create an activity log entry', async () => {
      prisma.activityLog.create.mockResolvedValue({ id: 'log-1', ...payload });

      await service.log(payload);

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'member.added',
          targetType: 'member',
          targetId: 'member-1',
          targetName: 'john@email.com',
          metadata: { role: 'MEMBER' },
          ipAddress: undefined,
        },
      });
    });

    it('should not throw if create fails', async () => {
      prisma.activityLog.create.mockRejectedValue(new Error('DB error'));

      await expect(service.log(payload)).resolves.toBeUndefined();
    });

    it('should handle undefined metadata', async () => {
      const payloadNoMeta: ActivityLogEventPayload = {
        organizationId: 'org-1',
        actorId: 'user-1',
        action: 'workflow.created',
        targetType: 'workflow',
      };

      prisma.activityLog.create.mockResolvedValue({
        id: 'log-2',
        ...payloadNoMeta,
      });

      await service.log(payloadNoMeta);

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          metadata: undefined,
        }),
      });
    });
  });

  describe('findAll', () => {
    const mockLogs = [
      {
        id: 'log-1',
        organizationId: 'org-1',
        action: 'member.added',
        targetType: 'member',
        targetId: 'member-1',
        targetName: 'john@email.com',
        metadata: { role: 'MEMBER' },
        createdAt: new Date('2026-05-05T00:00:00Z'),
        actor: { id: 'user-1', name: 'Admin User', email: 'admin@email.com' },
      },
    ];

    it('should return paginated activity logs', async () => {
      prisma.$transaction.mockResolvedValue([mockLogs, 1]);

      const result = await service.findAll('org-1', {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
      });

      expect(result.message).toBe('Activity logs retrieved successfully.');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: 'log-1',
        organizationId: 'org-1',
        action: 'member.added',
        targetType: 'member',
        targetId: 'member-1',
        targetName: 'john@email.com',
        metadata: { role: 'MEMBER' },
        actor: {
          id: 'user-1',
          name: 'Admin User',
          email: 'admin@email.com',
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        createdAt: expect.any(Date),
      });
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
    });

    it('should apply action filter', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('org-1', {
        page: 1,
        limit: 20,
        action: 'workflow.created',
        sortOrder: 'desc',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should apply date range filter', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('org-1', {
        page: 1,
        limit: 20,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        sortOrder: 'desc',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should apply search filter on targetName', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('org-1', {
        page: 1,
        limit: 20,
        search: 'workflow',
        sortOrder: 'desc',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should return empty data when no logs exist', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll('org-1', {
        page: 1,
        limit: 20,
        sortOrder: 'desc',
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });
});
