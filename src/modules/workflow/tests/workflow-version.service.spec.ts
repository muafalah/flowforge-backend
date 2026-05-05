import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { WorkflowVersionService } from '../workflow-version.service';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  $transaction: jest.fn(),
  workflow: { findFirst: jest.fn() },
  workflowVersion: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe('WorkflowVersionService', () => {
  let service: WorkflowVersionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowVersionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<WorkflowVersionService>(WorkflowVersionService);
    jest.clearAllMocks();
  });

  const validDefinition = {
    nodes: [
      { id: 'step1', type: 'http' },
      { id: 'step2', type: 'script' },
    ],
    edges: [{ from: 'step1', to: 'step2' }],
  };

  describe('createVersion', () => {
    it('should create a version with auto-incremented number', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        organizationId: 'org-1',
        deletedAt: null,
      });

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
          cb(mockPrisma),
      );
      mockPrisma.workflowVersion.findFirst.mockResolvedValue({ version: 2 });
      mockPrisma.workflowVersion.create.mockResolvedValue({ id: 'v-new' });
      mockPrisma.workflowVersion.findUniqueOrThrow.mockResolvedValue({
        id: 'v-new',
        workflowId: 'wf-1',
        version: 3,
        definition: validDefinition,
        isActive: false,
        createdBy: 'u-1',
        createdAt: new Date(),
        creator: { id: 'u-1', name: 'John', email: 'j@t.com' },
      });

      const result = await service.createVersion('org-1', 'wf-1', 'u-1', {
        definition: validDefinition,
      });

      expect(result.message).toBe('Version created successfully.');
      expect(result.data.version.version).toBe(3);
      expect(result.data.version.executionOrder).toEqual(['step1', 'step2']);
    });

    it('should start at version 1 if no versions exist', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        organizationId: 'org-1',
        deletedAt: null,
      });
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
          cb(mockPrisma),
      );
      mockPrisma.workflowVersion.findFirst.mockResolvedValue(null);
      mockPrisma.workflowVersion.create.mockResolvedValue({ id: 'v-1' });
      mockPrisma.workflowVersion.findUniqueOrThrow.mockResolvedValue({
        id: 'v-1',
        workflowId: 'wf-1',
        version: 1,
        definition: validDefinition,
        isActive: false,
        createdBy: 'u-1',
        createdAt: new Date(),
        creator: { id: 'u-1', name: 'J', email: 'j@t.com' },
      });

      const result = await service.createVersion('org-1', 'wf-1', 'u-1', {
        definition: validDefinition,
      });
      expect(result.data.version.version).toBe(1);
    });

    it('should reject a cyclic DAG', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        organizationId: 'org-1',
        deletedAt: null,
      });

      const cyclicDef = {
        nodes: [
          { id: 'A', type: 'http' },
          { id: 'B', type: 'script' },
        ],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' },
        ],
      };

      try {
        await service.createVersion('org-1', 'wf-1', 'u-1', {
          definition: cyclicDef,
        });
      } catch (e) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const resp = err.getResponse() as {
          error: { code: string; details: string[] };
        };
        expect(resp.error.code).toBe('INVALID_DAG');
        expect(resp.error.details.length).toBeGreaterThan(0);
      }
    });

    it('should reject duplicate node IDs', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        organizationId: 'org-1',
        deletedAt: null,
      });

      const dupDef = {
        nodes: [
          { id: 'X', type: 'http' },
          { id: 'X', type: 'script' },
        ],
        edges: [],
      };

      try {
        await service.createVersion('org-1', 'wf-1', 'u-1', {
          definition: dupDef,
        });
      } catch (e) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it('should throw WORKFLOW_NOT_FOUND', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);
      try {
        await service.createVersion('org-1', 'bad', 'u-1', {
          definition: validDefinition,
        });
      } catch (e) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('findAllVersions', () => {
    it('should return paginated versions', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        deletedAt: null,
      });
      const versions = [
        {
          id: 'v-1',
          workflowId: 'wf-1',
          version: 1,
          definition: validDefinition,
          isActive: true,
          createdAt: new Date(),
          creator: { id: 'u-1', name: 'J', email: 'j@t.com' },
        },
      ];
      mockPrisma.$transaction.mockResolvedValue([versions, 1]);

      const result = await service.findAllVersions('org-1', 'wf-1', {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should throw WORKFLOW_NOT_FOUND', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);
      try {
        await service.findAllVersions('org-1', 'bad', {
          page: 1,
          limit: 10,
          sortOrder: 'desc',
        });
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('activateVersion', () => {
    it('should activate version in a transaction', async () => {
      const txMock = {
        workflow: { findFirst: jest.fn(), update: jest.fn() },
        workflowVersion: {
          findFirst: jest.fn(),
          updateMany: jest.fn(),
          update: jest.fn(),
        },
      };
      txMock.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        deletedAt: null,
      });
      txMock.workflowVersion.findFirst.mockResolvedValue({
        id: 'v-2',
        workflowId: 'wf-1',
      });
      txMock.workflowVersion.updateMany.mockResolvedValue({ count: 2 });
      txMock.workflowVersion.update.mockResolvedValue({
        id: 'v-2',
        workflowId: 'wf-1',
        version: 2,
        definition: validDefinition,
        isActive: true,
        createdAt: new Date(),
        creator: { id: 'u-1', name: 'J', email: 'j@t.com' },
      });
      txMock.workflow.update.mockResolvedValue({});

      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );

      const result = await service.activateVersion('org-1', 'wf-1', 'v-2');

      expect(result.message).toBe('Version activated successfully.');
      expect(result.data.version.isActive).toBe(true);
      expect(txMock.workflowVersion.updateMany).toHaveBeenCalledWith({
        where: { workflowId: 'wf-1' },
        data: { isActive: false },
      });
      expect(txMock.workflow.update).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        data: { activeVersionId: 'v-2' },
      });
    });

    it('should throw VERSION_NOT_FOUND', async () => {
      const txMock = {
        workflow: { findFirst: jest.fn() },
        workflowVersion: { findFirst: jest.fn() },
      };
      txMock.workflow.findFirst.mockResolvedValue({
        id: 'wf-1',
        deletedAt: null,
      });
      txMock.workflowVersion.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
      );

      try {
        await service.activateVersion('org-1', 'wf-1', 'bad');
      } catch (e) {
        const err = e as HttpException;
        expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
        const resp = err.getResponse() as { error: { code: string } };
        expect(resp.error.code).toBe('VERSION_NOT_FOUND');
      }
    });
  });
});
