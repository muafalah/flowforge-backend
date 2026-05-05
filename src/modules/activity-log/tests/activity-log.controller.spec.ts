import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ActivityLogController } from '../activity-log.controller';
import { ActivityLogService } from '../activity-log.service';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PrismaService } from '../../../database/prisma.service';

describe('ActivityLogController', () => {
  let controller: ActivityLogController;
  let service: { findAll: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivityLogController],
      providers: [
        { provide: ActivityLogService, useValue: service },
        { provide: PrismaService, useValue: {} },
        RolesGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get<ActivityLogController>(ActivityLogController);
  });

  describe('findAll', () => {
    const orgId = 'org-1';
    const defaultQuery = {
      page: 1,
      limit: 20,
      sortOrder: 'desc' as const,
    };

    it('should delegate to service.findAll with correct params', async () => {
      const mockResponse = {
        message: 'Activity logs retrieved successfully.',
        data: [],
        meta: { total: 0, page: 1, limit: 20 },
      };
      service.findAll.mockResolvedValue(mockResponse);

      const result = await controller.findAll(orgId, defaultQuery);

      expect(service.findAll).toHaveBeenCalledWith(orgId, defaultQuery);
      expect(result).toEqual(mockResponse);
    });

    it('should pass filters to service', async () => {
      const queryWithFilters = {
        ...defaultQuery,
        action: 'member.added',
        targetType: 'member',
        search: 'john',
      };

      service.findAll.mockResolvedValue({
        message: 'Activity logs retrieved successfully.',
        data: [],
        meta: { total: 0, page: 1, limit: 20 },
      });

      await controller.findAll(orgId, queryWithFilters);

      expect(service.findAll).toHaveBeenCalledWith(orgId, queryWithFilters);
    });

    it('should pass date range filters to service', async () => {
      const queryWithDates = {
        ...defaultQuery,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      };

      service.findAll.mockResolvedValue({
        message: 'Activity logs retrieved successfully.',
        data: [],
        meta: { total: 0, page: 1, limit: 20 },
      });

      await controller.findAll(orgId, queryWithDates);

      expect(service.findAll).toHaveBeenCalledWith(orgId, queryWithDates);
    });

    it('should return paginated data from service', async () => {
      const mockData = [
        {
          id: 'log-1',
          action: 'version.created',
          targetType: 'version',
          targetName: 'v3',
          actor: { id: 'u-1', name: 'Admin', email: 'admin@test.com' },
          createdAt: new Date(),
        },
      ];

      service.findAll.mockResolvedValue({
        message: 'Activity logs retrieved successfully.',
        data: mockData,
        meta: { total: 1, page: 1, limit: 20 },
      });

      const result = await controller.findAll(orgId, defaultQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].action).toBe('version.created');
      expect(result.meta.total).toBe(1);
    });
  });
});
