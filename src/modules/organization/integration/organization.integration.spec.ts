import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { DatabaseModule } from '../../../database/database.module';
import { AuthModule } from '../../auth/auth.module';
import { OrganizationModule } from '../organization.module';
import { OrganizationService } from '../organization.service';
import { MembershipService } from '../membership.service';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../../database/prisma.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

/**
 * Integration tests for OrganizationService & MembershipService.
 *
 * These tests use a REAL database (flowforge_integration)
 * and exercise the service layer with real dependencies.
 * No HTTP layer is involved — we call service methods directly.
 */
describe('Organization & Membership (integration)', () => {
  let orgService: OrganizationService;
  let membershipService: MembershipService;
  let authService: AuthService;
  let prisma: PrismaService;

  const ownerUser = {
    name: 'Owner User',
    email: 'owner@integration.com',
    password: 'securepassword123',
  };

  const memberUser = {
    name: 'Member User',
    email: 'member@integration.com',
    password: 'securepassword123',
  };

  const adminUser = {
    name: 'Admin User',
    email: 'admin@integration.com',
    password: 'securepassword123',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        DatabaseModule,
        AuthModule,
        OrganizationModule,
      ],
    }).compile();

    orgService = module.get<OrganizationService>(OrganizationService);
    membershipService = module.get<MembershipService>(MembershipService);
    authService = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  /** Helper: register and return userId */
  async function registerUser(user: {
    name: string;
    email: string;
    password: string;
  }): Promise<string> {
    const result = await authService.register(user);
    return result.data.user.id;
  }

  /** Helper: get member info for service calls requiring currentMember */
  async function getMemberInfo(
    organizationId: string,
    userId: string,
  ): Promise<{
    id: string;
    organizationId: string;
    userId: string;
    role: string;
  }> {
    const member = await prisma.organizationMember.findFirst({
      where: { organizationId, userId },
    });
    return {
      id: member!.id,
      organizationId: member!.organizationId,
      userId: member!.userId,
      role: member!.role,
    };
  }

  // --- Organization CRUD Flow ---

  describe('create → findAll → findOne → update → softDelete', () => {
    it('should perform full CRUD lifecycle', async () => {
      const userId = await registerUser(ownerUser);

      // 1. Create
      const createResult = await orgService.create(userId, {
        name: 'Integration Org',
      });
      expect(createResult.message).toBe('Organization created successfully.');
      const orgId = createResult.data.organization.id;

      // 2. findAll — user should see 1 org
      const listResult = await orgService.findAll(userId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(listResult.data).toHaveLength(1);
      expect(listResult.data[0].name).toBe('Integration Org');
      expect(listResult.meta.total).toBe(1);

      // 3. findOne
      const findResult = await orgService.findOne(orgId);
      expect(findResult.data.organization.name).toBe('Integration Org');
      expect(findResult.data.organization.memberCount).toBe(1);

      // 4. Update
      const updateResult = await orgService.update(
        orgId,
        {
          name: 'Updated Org',
        },
        userId,
      );
      expect(updateResult.data.organization.name).toBe('Updated Org');

      // 5. Soft delete
      const deleteResult = await orgService.softDelete(orgId, userId);
      expect(deleteResult.message).toBe('Organization deleted successfully.');

      // 6. Verify it's gone from findAll
      const emptyList = await orgService.findAll(userId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(emptyList.data).toHaveLength(0);

      // 7. findOne should throw
      await expect(orgService.findOne(orgId)).rejects.toThrow(HttpException);
    });
  });

  // --- Membership Management Flow ---

  describe('create org → add member → update role → transfer ownership', () => {
    it('should manage members through the full lifecycle', async () => {
      const ownerId = await registerUser(ownerUser);
      const memberId = await registerUser(memberUser);

      // 1. Create org (owner is auto-added as OWNER)
      const orgResult = await orgService.create(ownerId, {
        name: 'Team Org',
      });
      const orgId = orgResult.data.organization.id;

      // 2. Add member
      const ownerMemberInfo = await getMemberInfo(orgId, ownerId);
      const addResult = await membershipService.addMember(
        orgId,
        {
          email: memberUser.email,
        },
        ownerMemberInfo,
      );
      expect(addResult.data.member.role).toBe(OrganizationRole.MEMBER);
      expect(addResult.data.member.user.email).toBe(memberUser.email);
      const memberMemberId = addResult.data.member.id;

      // 3. Verify member count
      const orgDetail = await orgService.findOne(orgId);
      expect(orgDetail.data.organization.memberCount).toBe(2);

      // 4. List members
      const membersList = await membershipService.findAll(orgId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(membersList.data).toHaveLength(2);
      expect(membersList.meta.total).toBe(2);

      // 5. Update role: MEMBER → ADMIN
      const updateResult = await membershipService.updateRole(
        orgId,
        memberMemberId,
        { role: 'ADMIN' },
        ownerMemberInfo,
      );
      expect(updateResult.data.member.role).toBe(OrganizationRole.ADMIN);

      // 6. Find member by userId
      const findByUserResult = await membershipService.findByUserId(
        orgId,
        memberId,
      );
      expect(findByUserResult.data.role).toBe(OrganizationRole.ADMIN);

      // 7. Transfer ownership
      const ownerMembership = await prisma.organizationMember.findFirst({
        where: { organizationId: orgId, userId: ownerId },
      });

      const transferResult = await membershipService.transferOwnership(
        orgId,
        { memberId: memberMemberId },
        {
          id: ownerMembership!.id,
          organizationId: orgId,
          userId: ownerId,
          role: OrganizationRole.OWNER,
        },
      );
      expect(transferResult.message).toBe(
        'Ownership transferred successfully.',
      );

      // 8. Verify roles swapped
      const afterTransfer = await membershipService.findAll(orgId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      const newOwner = afterTransfer.data.find(
        (m) => m.user.email === memberUser.email,
      );
      const oldOwner = afterTransfer.data.find(
        (m) => m.user.email === ownerUser.email,
      );
      expect(newOwner?.role).toBe(OrganizationRole.OWNER);
      expect(oldOwner?.role).toBe(OrganizationRole.ADMIN);
    });
  });

  // --- Member Removal Flow ---

  describe('member removal scenarios', () => {
    it('should allow self-leave and owner removal of members', async () => {
      const ownerId = await registerUser(ownerUser);
      await registerUser(memberUser);
      const adminUserId = await registerUser(adminUser);

      const orgResult = await orgService.create(ownerId, {
        name: 'Removal Test Org',
      });
      const orgId = orgResult.data.organization.id;

      // Add member and admin
      const ownerMemberInfo = await getMemberInfo(orgId, ownerId);
      const addMemberResult = await membershipService.addMember(
        orgId,
        {
          email: memberUser.email,
        },
        ownerMemberInfo,
      );
      const addAdminResult = await membershipService.addMember(
        orgId,
        {
          email: adminUser.email,
        },
        ownerMemberInfo,
      );

      // Promote admin
      await membershipService.updateRole(
        orgId,
        addAdminResult.data.member.id,
        {
          role: 'ADMIN',
        },
        ownerMemberInfo,
      );

      // Get owner membership info
      const ownerMembership = await prisma.organizationMember.findFirst({
        where: { organizationId: orgId, userId: ownerId },
      });

      // OWNER can remove MEMBER
      const removeResult = await membershipService.removeMember(
        orgId,
        addMemberResult.data.member.id,
        {
          id: ownerMembership!.id,
          organizationId: orgId,
          userId: ownerId,
          role: OrganizationRole.OWNER,
        },
      );
      expect(removeResult.message).toBe('Member removed successfully.');

      // Verify member count decreased
      const orgDetail = await orgService.findOne(orgId);
      expect(orgDetail.data.organization.memberCount).toBe(2); // owner + admin

      // ADMIN can leave (self-remove)
      const adminMembership = await prisma.organizationMember.findFirst({
        where: { organizationId: orgId, userId: adminUserId },
      });
      const leaveResult = await membershipService.removeMember(
        orgId,
        adminMembership!.id,
        {
          id: adminMembership!.id,
          organizationId: orgId,
          userId: adminUserId,
          role: OrganizationRole.ADMIN,
        },
      );
      expect(leaveResult.message).toBe('You have left the organization.');
    });
  });

  // --- Error Scenarios ---

  describe('error handling with real database', () => {
    it('should prevent adding duplicate member', async () => {
      const ownerId = await registerUser(ownerUser);
      await registerUser(memberUser);

      const orgResult = await orgService.create(ownerId, {
        name: 'Dup Test',
      });
      const orgId = orgResult.data.organization.id;

      const ownerMemberInfo = await getMemberInfo(orgId, ownerId);
      await membershipService.addMember(
        orgId,
        { email: memberUser.email },
        ownerMemberInfo,
      );

      // Try adding again
      try {
        await membershipService.addMember(
          orgId,
          { email: memberUser.email },
          ownerMemberInfo,
        );
        fail('Expected HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });

    it('should filter members by roles', async () => {
      const ownerId = await registerUser(ownerUser);
      await registerUser(memberUser);
      await registerUser(adminUser);

      const orgResult = await orgService.create(ownerId, {
        name: 'Filter Test',
      });
      const orgId = orgResult.data.organization.id;

      const ownerMemberInfo = await getMemberInfo(orgId, ownerId);
      await membershipService.addMember(
        orgId,
        {
          email: memberUser.email,
        },
        ownerMemberInfo,
      );
      const addAdmin = await membershipService.addMember(
        orgId,
        {
          email: adminUser.email,
        },
        ownerMemberInfo,
      );
      await membershipService.updateRole(
        orgId,
        addAdmin.data.member.id,
        {
          role: 'ADMIN',
        },
        ownerMemberInfo,
      );

      // Filter by OWNER
      const ownersOnly = await membershipService.findAll(orgId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        roles: [OrganizationRole.OWNER],
      });
      expect(ownersOnly.data).toHaveLength(1);
      expect(ownersOnly.data[0].role).toBe(OrganizationRole.OWNER);

      // Filter by MEMBER + ADMIN
      const nonOwners = await membershipService.findAll(orgId, {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        roles: [OrganizationRole.MEMBER, OrganizationRole.ADMIN],
      });
      expect(nonOwners.data).toHaveLength(2);
    });

    it('should search members by name', async () => {
      const ownerId = await registerUser(ownerUser);
      await registerUser(memberUser);

      const orgResult = await orgService.create(ownerId, {
        name: 'Search Test',
      });
      const orgId = orgResult.data.organization.id;

      const ownerMemberInfo = await getMemberInfo(orgId, ownerId);
      await membershipService.addMember(
        orgId,
        { email: memberUser.email },
        ownerMemberInfo,
      );

      // Search by owner name
      const searchResult = await membershipService.findAll(orgId, {
        page: 1,
        limit: 10,
        search: 'Owner',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(searchResult.data).toHaveLength(1);
      expect(searchResult.data[0].user.name).toBe('Owner User');
    });
  });
});
