import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrganizationService } from '../organization.service';
import { PrismaService } from '../../../database/prisma.service';

const mockPrismaService = {
  $transaction: jest.fn(),
  organization: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  organizationMember: {
    create: jest.fn(),
  },
};

describe('OrganizationService', () => {
  let service: OrganizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const userId = 'user-uuid';
    const dto = { name: 'Acme Corporation' };

    it('should create organization and add creator as OWNER', async () => {
      const mockOrg = {
        id: 'org-uuid',
        name: 'Acme Corporation',
        createdAt: new Date('2026-05-04'),
        updatedAt: new Date('2026-05-04'),
        deletedAt: null,
      };

      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: typeof mockPrismaService) => Promise<unknown>,
        ) => {
          return callback(mockPrismaService);
        },
      );
      mockPrismaService.organization.create.mockResolvedValue(mockOrg);
      mockPrismaService.organizationMember.create.mockResolvedValue({});

      const result = await service.create(userId, dto);

      expect(result.message).toBe('Organization created successfully.');
      expect(result.data.organization.name).toBe('Acme Corporation');
      expect(mockPrismaService.organization.create).toHaveBeenCalledWith({
        data: { name: 'Acme Corporation' },
      });
      expect(mockPrismaService.organizationMember.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-uuid',
          userId,
          role: OrganizationRole.OWNER,
        },
      });
    });
  });

  describe('findAll', () => {
    const userId = 'user-uuid';
    const query = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    it('should return paginated organizations', async () => {
      const mockOrgs = [
        {
          id: 'org-1',
          name: 'Org One',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { organizationMembers: 3 },
        },
      ];

      mockPrismaService.$transaction.mockResolvedValue([mockOrgs, 1]);

      const result = await service.findAll(userId, query);

      expect(result.message).toBe('Organizations retrieved successfully.');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].memberCount).toBe(3);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10 });
    });

    it('should filter by search term', async () => {
      mockPrismaService.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll(userId, {
        ...query,
        search: 'acme',
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return organization details', async () => {
      const mockOrg = {
        id: 'org-uuid',
        name: 'Acme Corp',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { organizationMembers: 5 },
      };

      mockPrismaService.organization.findFirst.mockResolvedValue(mockOrg);

      const result = await service.findOne('org-uuid');

      expect(result.message).toBe('Organization retrieved successfully.');
      expect(result.data.organization.memberCount).toBe(5);
    });

    it('should throw ORGANIZATION_NOT_FOUND if org does not exist', async () => {
      mockPrismaService.organization.findFirst.mockResolvedValue(null);

      try {
        await service.findOne('nonexistent');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('ORGANIZATION_NOT_FOUND');
      }
    });
  });

  describe('update', () => {
    it('should update organization name', async () => {
      const mockOrg = {
        id: 'org-uuid',
        name: 'Old Name',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      const updatedOrg = { ...mockOrg, name: 'New Name' };

      mockPrismaService.organization.findFirst.mockResolvedValue(mockOrg);
      mockPrismaService.organization.update.mockResolvedValue(updatedOrg);

      const result = await service.update(
        'org-uuid',
        { name: 'New Name' },
        'user-uuid',
      );

      expect(result.message).toBe('Organization updated successfully.');
      expect(result.data.organization.name).toBe('New Name');
    });

    it('should throw ORGANIZATION_NOT_FOUND if org does not exist', async () => {
      mockPrismaService.organization.findFirst.mockResolvedValue(null);

      try {
        await service.update('nonexistent', { name: 'New Name' }, 'user-uuid');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('softDelete', () => {
    it('should soft delete organization', async () => {
      const mockOrg = {
        id: 'org-uuid',
        name: 'Org',
        deletedAt: null,
      };

      mockPrismaService.organization.findFirst.mockResolvedValue(mockOrg);
      mockPrismaService.organization.update.mockResolvedValue({
        ...mockOrg,
        deletedAt: new Date(),
      });

      const result = await service.softDelete('org-uuid', 'user-uuid');

      expect(result.message).toBe('Organization deleted successfully.');
      expect(mockPrismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-uuid' },
        data: { deletedAt: expect.any(Date) as Date },
      });
    });

    it('should throw ORGANIZATION_NOT_FOUND if org does not exist', async () => {
      mockPrismaService.organization.findFirst.mockResolvedValue(null);

      try {
        await service.softDelete('nonexistent', 'user-uuid');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });
});
