import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DashboardController } from '../dashboard.controller';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from '../../../database/prisma.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: {
    getStats: jest.Mock;
    getRecentRuns: jest.Mock;
    getWorkflowSummary: jest.Mock;
  };

  const orgId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    service = {
      getStats: jest.fn(),
      getRecentRuns: jest.fn(),
      getWorkflowSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: service },
        { provide: PrismaService, useValue: {} },
        Reflector,
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  describe('getStats', () => {
    it('should delegate to service.getStats with organizationId', async () => {
      const mockResponse = {
        message: 'Dashboard stats retrieved successfully.',
        data: {
          activeRuns: 3,
          totalRuns24h: 50,
          successCount24h: 45,
          failedCount24h: 5,
          successRate24h: 90,
          avgDurationMs24h: 12345,
          totalWorkflows: 8,
          hourlyRuns: [],
        },
      };
      service.getStats.mockResolvedValue(mockResponse);

      const result = await controller.getStats(orgId);

      expect(service.getStats).toHaveBeenCalledWith(orgId);
      expect(result).toEqual(mockResponse);
    });

    it('should return stats shape correctly', async () => {
      const mockResponse = {
        message: 'Dashboard stats retrieved successfully.',
        data: {
          activeRuns: 0,
          totalRuns24h: 0,
          successCount24h: 0,
          failedCount24h: 0,
          successRate24h: 0,
          avgDurationMs24h: 0,
          totalWorkflows: 0,
          hourlyRuns: [],
        },
      };
      service.getStats.mockResolvedValue(mockResponse);

      const result = await controller.getStats(orgId);

      expect(result.message).toBe('Dashboard stats retrieved successfully.');
      expect(result.data).toBeDefined();
      expect(result.data.hourlyRuns).toBeInstanceOf(Array);
    });
  });

  describe('getRecentRuns', () => {
    const defaultQuery = { page: 1, limit: 10 };

    it('should delegate to service.getRecentRuns with correct params', async () => {
      const mockResponse = {
        message: 'Recent runs retrieved successfully.',
        data: [],
        meta: { total: 0, page: 1, limit: 10 },
      };
      service.getRecentRuns.mockResolvedValue(mockResponse);

      const result = await controller.getRecentRuns(orgId, defaultQuery);

      expect(service.getRecentRuns).toHaveBeenCalledWith(orgId, defaultQuery);
      expect(result).toEqual(mockResponse);
    });

    it('should pass status filter to service', async () => {
      const queryWithFilter = { page: 1, limit: 10, status: 'FAILED' as const };
      service.getRecentRuns.mockResolvedValue({
        message: 'Recent runs retrieved successfully.',
        data: [],
        meta: { total: 0, page: 1, limit: 10 },
      });

      await controller.getRecentRuns(orgId, queryWithFilter);

      expect(service.getRecentRuns).toHaveBeenCalledWith(
        orgId,
        queryWithFilter,
      );
    });

    it('should return paginated data from service', async () => {
      const mockRuns = [
        {
          id: 'run-1',
          workflowId: 'wf-1',
          workflowName: 'Daily ETL',
          status: 'SUCCESS',
          triggerType: 'MANUAL',
          triggeredBy: 'user-1',
          triggeredUserName: 'John',
          durationMs: 3200,
          startedAt: '2026-05-05T10:30:00.000Z',
          createdAt: '2026-05-05T10:30:00.000Z',
        },
      ];

      service.getRecentRuns.mockResolvedValue({
        message: 'Recent runs retrieved successfully.',
        data: mockRuns,
        meta: { total: 1, page: 1, limit: 10 },
      });

      const result = await controller.getRecentRuns(orgId, defaultQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].workflowName).toBe('Daily ETL');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getWorkflowSummary', () => {
    it('should delegate to service.getWorkflowSummary with organizationId', async () => {
      const mockResponse = {
        message: 'Workflow summary retrieved successfully.',
        data: [],
      };
      service.getWorkflowSummary.mockResolvedValue(mockResponse);

      const result = await controller.getWorkflowSummary(orgId);

      expect(service.getWorkflowSummary).toHaveBeenCalledWith(orgId);
      expect(result).toEqual(mockResponse);
    });

    it('should return workflow summary data from service', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          name: 'Daily ETL',
          description: 'Syncs data',
          lastRunStatus: 'SUCCESS',
          lastRunDuration: 3200,
          lastRunAt: '2026-05-05T10:30:00.000Z',
          totalRuns24h: 15,
          successCount24h: 14,
          activeVersionDefinition: { nodes: [], edges: [] },
        },
      ];

      service.getWorkflowSummary.mockResolvedValue({
        message: 'Workflow summary retrieved successfully.',
        data: mockWorkflows,
      });

      const result = await controller.getWorkflowSummary(orgId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Daily ETL');
      expect(result.data[0].activeVersionDefinition).toBeDefined();
    });
  });
});
