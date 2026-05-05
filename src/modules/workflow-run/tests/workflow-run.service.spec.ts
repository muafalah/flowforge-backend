import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowRunService } from '../workflow-run.service';
import { PrismaService } from '../../../database/prisma.service';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { WorkflowExecutionService } from '../../workflow-execution/workflow-execution.service';
import { getQueueToken } from '@nestjs/bullmq';
import { HttpException } from '@nestjs/common';

describe('WorkflowRunService', () => {
  let service: WorkflowRunService;

  let executionQueue: { add: jest.Mock };

  const mockPrisma = {
    workflow: {
      findFirst: jest.fn(),
    },
    workflowRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockElasticsearch = {
    queryLogs: jest.fn(),
  };

  const mockExecutionService = {
    cancelRun: jest.fn(),
  };

  beforeEach(async () => {
    executionQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ElasticsearchService, useValue: mockElasticsearch },
        { provide: WorkflowExecutionService, useValue: mockExecutionService },
        {
          provide: getQueueToken('workflow-execution'),
          useValue: executionQueue,
        },
      ],
    }).compile();

    service = module.get<WorkflowRunService>(WorkflowRunService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerManualRun', () => {
    const orgId = 'org-1';
    const workflowId = 'wf-1';
    const userId = 'user-1';

    it('should trigger a manual run successfully', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: workflowId,
        activeVersionId: 'v-1',
        activeVersion: { id: 'v-1', version: 1 },
      });
      mockPrisma.workflowRun.create.mockResolvedValue({
        id: 'run-1',
        organizationId: orgId,
        workflowId,
        workflowVersionId: 'v-1',
        status: 'PENDING',
        triggerType: 'MANUAL',
        triggeredBy: userId,
        createdAt: new Date(),
      });

      const result = await service.triggerManualRun(orgId, workflowId, userId);

      expect(result.message).toBe('Workflow run triggered successfully.');
      expect(result.data.run.id).toBe('run-1');
      expect(result.data.run.status).toBe('PENDING');
      expect(executionQueue.add).toHaveBeenCalledWith(
        'execute-workflow',
        expect.objectContaining({ runId: 'run-1', triggerType: 'MANUAL' }),
        expect.any(Object),
      );
    });

    it('should throw if workflow not found', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);

      await expect(
        service.triggerManualRun(orgId, 'invalid', userId),
      ).rejects.toThrow(HttpException);
    });

    it('should throw if no active version', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: workflowId,
        activeVersionId: null,
        activeVersion: null,
      });

      await expect(
        service.triggerManualRun(orgId, workflowId, userId),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findAll', () => {
    it('should return paginated runs', async () => {
      const runs = [
        {
          id: 'run-1',
          organizationId: 'org-1',
          workflowId: 'wf-1',
          workflowVersionId: 'v-1',
          status: 'SUCCESS',
          triggerType: 'MANUAL',
          triggeredBy: 'user-1',
          triggeredUser: { id: 'user-1', name: 'Test', email: 'test@test.com' },
          version: { version: 1 },
          errorMessage: null,
          startedAt: new Date(),
          finishedAt: new Date(),
          durationMs: 1000,
          createdAt: new Date(),
        },
      ];

      mockPrisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
      mockPrisma.$transaction.mockResolvedValue([runs, 1]);

      const result = await service.findAll('org-1', 'wf-1', {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
      });

      expect(result.message).toBe('Runs retrieved successfully.');
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('cancel', () => {
    it('should cancel a running workflow', async () => {
      mockPrisma.workflowRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
      });
      mockPrisma.workflowRun.update.mockResolvedValue({});
      mockExecutionService.cancelRun.mockReturnValue(true);

      const result = await service.cancel('org-1', 'wf-1', 'run-1');

      expect(result.message).toBe('Run cancellation requested.');
      expect(mockExecutionService.cancelRun).toHaveBeenCalledWith('run-1');
    });

    it('should throw if run not found', async () => {
      mockPrisma.workflowRun.findFirst.mockResolvedValue(null);

      await expect(service.cancel('org-1', 'wf-1', 'invalid')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw if run is already completed', async () => {
      mockPrisma.workflowRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'SUCCESS',
      });

      await expect(service.cancel('org-1', 'wf-1', 'run-1')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('getLogs', () => {
    it('should return logs from Elasticsearch', async () => {
      mockElasticsearch.queryLogs.mockResolvedValue({
        logs: [{ logId: 'log-1', message: 'test', level: 'INFO' }],
        total: 1,
      });

      const result = await service.getLogs('run-1', {
        page: 1,
        limit: 100,
      });

      expect(result.message).toBe('Logs retrieved successfully.');
      expect(result.data).toHaveLength(1);
    });
  });
});
