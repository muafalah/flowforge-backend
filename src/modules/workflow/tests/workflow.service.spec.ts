import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { WorkflowService } from '../workflow.service';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  $transaction: jest.fn(),
  workflow: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

describe('WorkflowService', () => {
  let service: WorkflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<WorkflowService>(WorkflowService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a workflow', async () => {
      const mock = {
        id: 'wf-1',
        organizationId: 'org-1',
        name: 'Pipeline',
        description: null,
        access: 'EDITOR',
        activeVersionId: null,
        createdBy: 'u-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        creator: { id: 'u-1', name: 'John', email: 'j@t.com' },
        _count: { versions: 0 },
      };
      mockPrisma.workflow.create.mockResolvedValue(mock);
      const result = await service.create('org-1', 'u-1', {
        name: 'Pipeline',
        access: 'EDITOR',
      });
      expect(result.message).toBe('Workflow created successfully.');
      expect(result.data.workflow.name).toBe('Pipeline');
      expect(result.data.workflow.versionCount).toBe(0);
    });
  });

  describe('findAll', () => {
    it('should return paginated workflows', async () => {
      const wfs = [
        {
          id: 'wf-1',
          organizationId: 'org-1',
          name: 'P1',
          description: null,
          access: 'EDITOR',
          activeVersion: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          creator: { id: 'u-1', name: 'J', email: 'j@t.com' },
          _count: { versions: 2 },
        },
      ];
      mockPrisma.$transaction.mockResolvedValue([wfs, 1]);
      const result = await service.findAll('org-1', {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return workflow details', async () => {
      const mock = {
        id: 'wf-1',
        organizationId: 'org-1',
        name: 'P',
        description: null,
        access: 'EDITOR',
        activeVersion: { id: 'v-1', version: 3, createdAt: new Date() },
        createdAt: new Date(),
        updatedAt: new Date(),
        creator: { id: 'u-1', name: 'J', email: 'j@t.com' },
        _count: { versions: 3 },
      };
      mockPrisma.workflow.findFirst.mockResolvedValue(mock);
      const result = await service.findOne('org-1', 'wf-1');
      expect(result.data.workflow.activeVersion!.version).toBe(3);
    });

    it('should throw WORKFLOW_NOT_FOUND', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);
      try {
        await service.findOne('org-1', 'bad');
      } catch (e) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(
          (err.getResponse() as { error: { code: string } }).error.code,
        ).toBe('WORKFLOW_NOT_FOUND');
      }
    });
  });

  describe('update', () => {
    it('should update workflow', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        deletedAt: null,
      });
      mockPrisma.workflow.update.mockResolvedValue({
        id: 'wf-1',
        organizationId: 'org-1',
        name: 'New',
        description: null,
        access: 'EDITOR',
        activeVersion: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creator: { id: 'u-1', name: 'J', email: 'j@t.com' },
        _count: { versions: 1 },
      });
      const result = await service.update('org-1', 'wf-1', { name: 'New' });
      expect(result.data.workflow.name).toBe('New');
    });

    it('should throw WORKFLOW_NOT_FOUND', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);
      try {
        await service.update('org-1', 'bad', { name: 'X' });
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('softDelete', () => {
    it('should soft delete and clear activeVersionId', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        deletedAt: null,
      });
      mockPrisma.workflow.update.mockResolvedValue({});
      const result = await service.softDelete('org-1', 'wf-1');
      expect(result.message).toBe('Workflow deleted successfully.');
      expect(mockPrisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        data: { deletedAt: expect.any(Date) as Date, activeVersionId: null },
      });
    });

    it('should throw WORKFLOW_NOT_FOUND', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);
      try {
        await service.softDelete('org-1', 'bad');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });
});
