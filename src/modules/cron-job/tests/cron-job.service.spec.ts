import { Test, TestingModule } from '@nestjs/testing';
import { CronJobService } from '../cron-job.service';
import { PrismaService } from '../../../database/prisma.service';
import { WorkflowRunService } from '../../workflow-run/workflow-run.service';
import { HttpException } from '@nestjs/common';

describe('CronJobService', () => {
  let service: CronJobService;

  const mockPrisma = {
    workflow: { findFirst: jest.fn() },
    cronJob: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockRunService = {
    triggerRun: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronJobService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WorkflowRunService, useValue: mockRunService },
      ],
    }).compile();

    service = module.get<CronJobService>(CronJobService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create a cron job successfully', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
      mockPrisma.cronJob.create.mockResolvedValue({
        id: 'cj-1',
        organizationId: 'org-1',
        workflowId: 'wf-1',
        name: 'Test Cron',
        description: null,
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
        isActive: true,
        lastRunAt: null,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create('org-1', 'wf-1', 'user-1', {
        name: 'Test Cron',
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
      });

      expect(result.message).toBe('Cron job created successfully.');
      expect(result.data.cronJob.id).toBe('cj-1');
    });

    it('should throw if workflow not found', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', 'invalid', 'user-1', {
          name: 'Test',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findAll', () => {
    it('should return paginated cron jobs', async () => {
      const cronJobs = [
        {
          id: 'cj-1',
          organizationId: 'org-1',
          workflowId: 'wf-1',
          name: 'Test',
          description: null,
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
          isActive: true,
          lastRunAt: null,
          nextRunAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.$transaction.mockResolvedValue([cronJobs, 1]);

      const result = await service.findAll('org-1', 'wf-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('update', () => {
    it('should update a cron job', async () => {
      mockPrisma.cronJob.findFirst.mockResolvedValue({
        id: 'cj-1',
        timezone: 'UTC',
      });
      mockPrisma.cronJob.update.mockResolvedValue({
        id: 'cj-1',
        organizationId: 'org-1',
        workflowId: 'wf-1',
        name: 'Updated',
        description: null,
        cronExpression: '*/30 * * * *',
        timezone: 'UTC',
        isActive: true,
        lastRunAt: null,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.update('org-1', 'wf-1', 'cj-1', {
        name: 'Updated',
      });

      expect(result.message).toBe('Cron job updated successfully.');
    });

    it('should throw if cron job not found', async () => {
      mockPrisma.cronJob.findFirst.mockResolvedValue(null);

      await expect(
        service.update('org-1', 'wf-1', 'invalid', { name: 'x' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should delete a cron job', async () => {
      mockPrisma.cronJob.findFirst.mockResolvedValue({ id: 'cj-1' });
      mockPrisma.cronJob.delete.mockResolvedValue({});

      const result = await service.remove('org-1', 'wf-1', 'cj-1');
      expect(result.message).toBe('Cron job deleted successfully.');
    });
  });

  describe('processDueCronJobs', () => {
    it('should trigger due cron jobs', async () => {
      mockPrisma.cronJob.findMany.mockResolvedValue([
        {
          id: 'cj-1',
          organizationId: 'org-1',
          workflowId: 'wf-1',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
          workflow: {
            id: 'wf-1',
            activeVersionId: 'v-1',
            deletedAt: null,
          },
        },
      ]);
      mockRunService.triggerRun.mockResolvedValue({ id: 'run-1' });
      mockPrisma.cronJob.update.mockResolvedValue({});

      await service.processDueCronJobs();

      expect(mockRunService.triggerRun).toHaveBeenCalledWith(
        'org-1',
        'wf-1',
        'CRON',
        'v-1',
      );
    });

    it('should skip workflows with no active version', async () => {
      mockPrisma.cronJob.findMany.mockResolvedValue([
        {
          id: 'cj-1',
          organizationId: 'org-1',
          workflowId: 'wf-1',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
          workflow: {
            id: 'wf-1',
            activeVersionId: null,
            deletedAt: null,
          },
        },
      ]);

      await service.processDueCronJobs();

      expect(mockRunService.triggerRun).not.toHaveBeenCalled();
    });
  });
});
