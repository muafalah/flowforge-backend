import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipService } from '../membership.service';
import { PrismaService } from '../../../database/prisma.service';

const mockPrismaService = {
  $transaction: jest.fn(),
  user: {
    findUnique: jest.fn(),
  },
  organizationMember: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

describe('MembershipService', () => {
  let service: MembershipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<MembershipService>(MembershipService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    const orgId = 'org-uuid';
    const query = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    it('should return paginated members', async () => {
      const mockMembers = [
        {
          id: 'member-1',
          role: OrganizationRole.OWNER,
          createdAt: new Date(),
          user: { id: 'user-1', name: 'John', email: 'john@email.com' },
        },
      ];

      mockPrismaService.$transaction.mockResolvedValue([mockMembers, 1]);

      const result = await service.findAll(orgId, query);

      expect(result.message).toBe('Members retrieved successfully.');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].user.name).toBe('John');
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10 });
    });

    it('should filter members by roles', async () => {
      const rolesQuery = {
        ...query,
        roles: [OrganizationRole.OWNER, OrganizationRole.ADMIN],
      };
      const mockMembers = [
        {
          id: 'member-1',
          role: OrganizationRole.OWNER,
          createdAt: new Date(),
          user: { id: 'user-1', name: 'John', email: 'john@email.com' },
        },
      ];

      mockPrismaService.$transaction.mockResolvedValue([mockMembers, 1]);

      await service.findAll(orgId, rolesQuery);

      expect(
        mockPrismaService.organizationMember.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] },
          }) as unknown,
        }),
      );
    });
  });

  describe('findByUserId', () => {
    const orgId = 'org-uuid';
    const userId = 'user-uuid';

    it('should return membership data with user and organization details', async () => {
      const mockMember = {
        id: 'member-1',
        userId,
        organizationId: orgId,
        role: OrganizationRole.MEMBER,
        createdAt: new Date('2026-05-04T00:00:00.000Z'),
        updatedAt: new Date('2026-05-04T00:00:00.000Z'),
        user: { id: userId, name: 'Jane Doe', email: 'jane@email.com' },
        organization: { id: orgId, name: 'Acme Corp' },
      };

      mockPrismaService.organizationMember.findUnique.mockResolvedValue(
        mockMember,
      );

      const result = await service.findByUserId(orgId, userId);

      expect(result.message).toBe('Member retrieved successfully.');
      expect(result.data).toEqual({
        id: 'member-1',
        userId,
        organizationId: orgId,
        role: OrganizationRole.MEMBER,
        createdAt: mockMember.createdAt,
        updatedAt: mockMember.updatedAt,
        user: {
          id: userId,
          name: 'Jane Doe',
          email: 'jane@email.com',
        },
        organization: {
          id: orgId,
          name: 'Acme Corp',
        },
      });
      expect(
        mockPrismaService.organizationMember.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId,
          },
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          organization: {
            select: { id: true, name: true },
          },
        },
      });
    });

    it('should throw MEMBER_NOT_FOUND if user is not a member', async () => {
      mockPrismaService.organizationMember.findUnique.mockResolvedValue(null);

      try {
        await service.findByUserId(orgId, userId);
        fail('Expected HttpException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('MEMBER_NOT_FOUND');
      }
    });
  });

  describe('addMember', () => {
    const orgId = 'org-uuid';
    const dto = { email: 'jane@email.com' };
    const currentMember = {
      id: 'member-owner',
      organizationId: orgId,
      userId: 'user-owner',
      role: OrganizationRole.OWNER,
    };

    it('should add member successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-2',
        name: 'Jane',
        email: 'jane@email.com',
        deletedAt: null,
      });

      mockPrismaService.organizationMember.findUnique.mockResolvedValue(null);

      mockPrismaService.organizationMember.create.mockResolvedValue({
        id: 'member-2',
        role: OrganizationRole.MEMBER,
        createdAt: new Date(),
        user: { id: 'user-2', name: 'Jane', email: 'jane@email.com' },
      });

      const result = await service.addMember(orgId, dto, currentMember);

      expect(result.message).toBe('Member added successfully.');
      expect(result.data.member.role).toBe(OrganizationRole.MEMBER);
    });

    it('should throw USER_NOT_FOUND if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      try {
        await service.addMember(orgId, dto, currentMember);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('USER_NOT_FOUND');
      }
    });

    it('should throw MEMBER_ALREADY_EXISTS for duplicate member', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-2',
        email: 'jane@email.com',
        deletedAt: null,
      });
      mockPrismaService.organizationMember.findUnique.mockResolvedValue({
        id: 'member-existing',
      });

      try {
        await service.addMember(orgId, dto, currentMember);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.CONFLICT);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('MEMBER_ALREADY_EXISTS');
      }
    });
  });

  describe('updateRole', () => {
    const orgId = 'org-uuid';

    it('should update member role successfully', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue({
        id: 'member-2',
        organizationId: orgId,
        userId: 'user-2',
        role: OrganizationRole.MEMBER,
      });

      mockPrismaService.organizationMember.update.mockResolvedValue({
        id: 'member-2',
        role: OrganizationRole.ADMIN,
        createdAt: new Date(),
        user: { id: 'user-2', name: 'Jane', email: 'jane@email.com' },
      });

      const result = await service.updateRole(
        orgId,
        'member-2',
        {
          role: 'ADMIN',
        },
        {
          id: 'member-owner',
          organizationId: orgId,
          userId: 'user-owner',
          role: OrganizationRole.OWNER,
        },
      );

      expect(result.message).toBe('Member role updated successfully.');
      expect(result.data.member.role).toBe(OrganizationRole.ADMIN);
    });

    it('should throw MEMBER_NOT_FOUND if member does not exist', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue(null);

      try {
        await service.updateRole(
          orgId,
          'nonexistent',
          { role: 'ADMIN' },
          {
            id: 'member-owner',
            organizationId: orgId,
            userId: 'user-owner',
            role: OrganizationRole.OWNER,
          },
        );
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('MEMBER_NOT_FOUND');
      }
    });

    it('should throw FORBIDDEN when trying to change OWNER role', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        organizationId: orgId,
        role: OrganizationRole.OWNER,
      });

      try {
        await service.updateRole(
          orgId,
          'member-1',
          { role: 'MEMBER' },
          {
            id: 'member-owner',
            organizationId: orgId,
            userId: 'user-owner',
            role: OrganizationRole.OWNER,
          },
        );
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });

  describe('removeMember', () => {
    const orgId = 'org-uuid';

    const ownerMember = {
      id: 'member-owner',
      organizationId: orgId,
      userId: 'user-owner',
      role: OrganizationRole.OWNER,
    };

    const adminMember = {
      id: 'member-admin',
      organizationId: orgId,
      userId: 'user-admin',
      role: OrganizationRole.ADMIN,
    };

    const regularMember = {
      id: 'member-regular',
      organizationId: orgId,
      userId: 'user-regular',
      role: OrganizationRole.MEMBER,
    };

    it('should allow user to leave organization (self-remove)', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue(
        adminMember,
      );
      mockPrismaService.organizationMember.delete.mockResolvedValue({});

      const result = await service.removeMember(orgId, adminMember.id, {
        id: adminMember.id,
        organizationId: orgId,
        userId: adminMember.userId,
        role: adminMember.role,
      });

      expect(result.message).toBe('You have left the organization.');
    });

    it('should prevent removing an OWNER', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue(
        ownerMember,
      );

      try {
        await service.removeMember(orgId, ownerMember.id, {
          id: 'member-admin',
          organizationId: orgId,
          userId: 'user-admin',
          role: OrganizationRole.ADMIN,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should allow ADMIN to remove MEMBER', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue(
        regularMember,
      );
      mockPrismaService.organizationMember.delete.mockResolvedValue({});

      const result = await service.removeMember(orgId, regularMember.id, {
        id: adminMember.id,
        organizationId: orgId,
        userId: adminMember.userId,
        role: adminMember.role,
      });

      expect(result.message).toBe('Member removed successfully.');
    });

    it('should prevent ADMIN from removing another ADMIN', async () => {
      const anotherAdmin = {
        ...adminMember,
        id: 'member-admin-2',
        userId: 'user-admin-2',
      };

      mockPrismaService.organizationMember.findFirst.mockResolvedValue(
        anotherAdmin,
      );

      try {
        await service.removeMember(orgId, anotherAdmin.id, {
          id: adminMember.id,
          organizationId: orgId,
          userId: adminMember.userId,
          role: adminMember.role,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should prevent MEMBER from removing others', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue(
        adminMember,
      );

      try {
        await service.removeMember(orgId, adminMember.id, {
          id: regularMember.id,
          organizationId: orgId,
          userId: regularMember.userId,
          role: regularMember.role,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should throw MEMBER_NOT_FOUND if member does not exist', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue(null);

      try {
        await service.removeMember(orgId, 'nonexistent', {
          id: ownerMember.id,
          organizationId: orgId,
          userId: ownerMember.userId,
          role: ownerMember.role,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('transferOwnership', () => {
    const orgId = 'org-uuid';

    const currentOwner = {
      id: 'member-owner',
      organizationId: orgId,
      userId: 'user-owner',
      role: OrganizationRole.OWNER,
    };

    it('should transfer ownership successfully', async () => {
      const targetMember = {
        id: 'member-admin',
        organizationId: orgId,
        userId: 'user-admin',
        role: OrganizationRole.ADMIN,
      };

      mockPrismaService.organizationMember.findFirst.mockResolvedValue(
        targetMember,
      );
      mockPrismaService.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.transferOwnership(
        orgId,
        { memberId: targetMember.id },
        currentOwner,
      );

      expect(result.message).toBe('Ownership transferred successfully.');
    });

    it('should throw MEMBER_NOT_FOUND if target does not exist', async () => {
      mockPrismaService.organizationMember.findFirst.mockResolvedValue(null);

      try {
        await service.transferOwnership(
          orgId,
          { memberId: 'nonexistent' },
          currentOwner,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should throw BAD_REQUEST if target is already OWNER', async () => {
      const anotherOwner = {
        id: 'member-owner-2',
        organizationId: orgId,
        role: OrganizationRole.OWNER,
      };

      mockPrismaService.organizationMember.findFirst.mockResolvedValue(
        anotherOwner,
      );

      try {
        await service.transferOwnership(
          orgId,
          { memberId: anotherOwner.id },
          currentOwner,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });
  });
});
