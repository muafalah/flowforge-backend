import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from '../../../database/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: jest.Mocked<PrismaService>;

  const mockOrgId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    const mockPrisma = {
      workflowRun: {
        count: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      workflow: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prisma = module.get(PrismaService);
  });

  describe('getStats', () => {
    it('should return aggregated stats with correct shape', async () => {
      (prisma.$transaction as jest.Mock).mockResolvedValue([
        3, // activeRuns
        50, // totalRuns24h
        45, // successCount24h
        5, // failedCount24h
        { _avg: { durationMs: 12345 } }, // avgDuration
        8, // totalWorkflows
      ]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.getStats(mockOrgId);

      expect(result.message).toBe('Dashboard stats retrieved successfully.');
      expect(result.data.activeRuns).toBe(3);
      expect(result.data.totalRuns24h).toBe(50);
      expect(result.data.successCount24h).toBe(45);
      expect(result.data.failedCount24h).toBe(5);
      expect(result.data.successRate24h).toBe(90);
      expect(result.data.avgDurationMs24h).toBe(12345);
      expect(result.data.totalWorkflows).toBe(8);
      expect(result.data.hourlyRuns).toHaveLength(24);
    });

    it('should return 0% success rate when no runs', async () => {
      (prisma.$transaction as jest.Mock).mockResolvedValue([
        0,
        0,
        0,
        0,
        { _avg: { durationMs: null } },
        0,
      ]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await service.getStats(mockOrgId);

      expect(result.data.successRate24h).toBe(0);
      expect(result.data.avgDurationMs24h).toBe(0);
    });

    it('should handle raw query failure gracefully', async () => {
      (prisma.$transaction as jest.Mock).mockResolvedValue([
        0,
        10,
        8,
        2,
        { _avg: { durationMs: 1000 } },
        3,
      ]);
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await service.getStats(mockOrgId);

      // Should fallback to empty hourly data
      expect(result.data.hourlyRuns).toHaveLength(24);
      result.data.hourlyRuns.forEach((h) => {
        expect(h.success).toBe(0);
        expect(h.failed).toBe(0);
      });
    });
  });

  describe('getRecentRuns', () => {
    it('should return paginated cross-workflow runs', async () => {
      const mockRuns = [
        {
          id: 'run-1',
          organizationId: mockOrgId,
          workflowId: 'wf-1',
          status: 'SUCCESS',
          triggerType: 'MANUAL',
          triggeredBy: 'user-1',
          durationMs: 3200,
          startedAt: new Date(),
          createdAt: new Date(),
          workflow: { id: 'wf-1', name: 'Daily ETL' },
          triggeredUser: { id: 'user-1', name: 'John' },
        },
      ];

      (prisma.$transaction as jest.Mock).mockResolvedValue([mockRuns, 1]);

      const result = await service.getRecentRuns(mockOrgId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].workflowName).toBe('Daily ETL');
      expect(result.data[0].triggeredUserName).toBe('John');
      expect(result.meta.total).toBe(1);
    });

    it('should apply status filter', async () => {
      (prisma.$transaction as jest.Mock).mockResolvedValue([[], 0]);

      await service.getRecentRuns(mockOrgId, {
        page: 1,
        limit: 10,
        status: 'FAILED',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle null triggeredUser', async () => {
      const mockRuns = [
        {
          id: 'run-2',
          organizationId: mockOrgId,
          workflowId: 'wf-2',
          status: 'SUCCESS',
          triggerType: 'CRON',
          triggeredBy: null,
          durationMs: null,
          startedAt: null,
          createdAt: new Date(),
          workflow: { id: 'wf-2', name: 'Cron Job' },
          triggeredUser: null,
        },
      ];

      (prisma.$transaction as jest.Mock).mockResolvedValue([mockRuns, 1]);

      const result = await service.getRecentRuns(mockOrgId, {
        page: 1,
        limit: 10,
      });

      expect(result.data[0].triggeredUserName).toBeNull();
      expect(result.data[0].durationMs).toBeNull();
    });
  });

  describe('getWorkflowSummary', () => {
    it('should return workflows with last run info and DAG definition', async () => {
      const mockDef = { nodes: [], edges: [] };
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'wf-1',
          name: 'Daily ETL',
          description: 'Syncs data',
          activeVersion: { definition: mockDef },
          runs: [
            {
              status: 'SUCCESS',
              durationMs: 3200,
              createdAt: new Date(),
            },
          ],
          _count: { runs: 15 },
        },
      ]);

      (prisma.workflowRun.groupBy as jest.Mock).mockResolvedValue([
        { workflowId: 'wf-1', _count: { id: 14 } },
      ]);

      const result = await service.getWorkflowSummary(mockOrgId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Daily ETL');
      expect(result.data[0].lastRunStatus).toBe('SUCCESS');
      expect(result.data[0].successCount24h).toBe(14);
      expect(result.data[0].activeVersionDefinition).toEqual(mockDef);
    });

    it('should handle workflows with no runs', async () => {
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'wf-2',
          name: 'New Workflow',
          description: null,
          activeVersion: null,
          runs: [],
          _count: { runs: 0 },
        },
      ]);

      (prisma.workflowRun.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await service.getWorkflowSummary(mockOrgId);

      expect(result.data[0].lastRunStatus).toBeNull();
      expect(result.data[0].lastRunDuration).toBeNull();
      expect(result.data[0].successCount24h).toBe(0);
      expect(result.data[0].activeVersionDefinition).toBeNull();
    });
  });
});
