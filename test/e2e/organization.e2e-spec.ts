import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/database/prisma.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../src/database/database.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { OrganizationModule } from '../../src/modules/organization/organization.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('Organization & Membership (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        DatabaseModule,
        AuthModule,
        OrganizationModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
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
    await app.close();
  });

  // --- Helpers ---

  const testUser = {
    name: 'Owner User',
    email: 'owner@email.com',
    password: 'securepassword123',
  };

  const secondUser = {
    name: 'Member User',
    email: 'member@email.com',
    password: 'securepassword123',
  };

  const thirdUser = {
    name: 'Admin User',
    email: 'admin@email.com',
    password: 'securepassword123',
  };

  async function registerAndLogin(user: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ accessToken: string; userId: string }> {
    const registerRes = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(user)
      .expect(HttpStatus.CREATED);

    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(HttpStatus.OK);

    return {
      accessToken: loginRes.body.data.accessToken as string,
      userId: registerRes.body.data.user.id as string,
    };
  }

  async function createOrg(accessToken: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name })
      .expect(HttpStatus.CREATED);

    return res.body.data.organization.id as string;
  }

  // --- Organization CRUD ---

  describe('POST /v1/organizations', () => {
    it('should create organization and make creator OWNER', async () => {
      const { accessToken } = await registerAndLogin(testUser);

      const res = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Acme Corporation' })
        .expect(HttpStatus.CREATED);

      expect(res.body.message).toBe('Organization created successfully.');
      expect(res.body.data.organization.name).toBe('Acme Corporation');
      expect(res.body.data.organization.id).toBeDefined();
    });

    it('should return 400 for name shorter than 3 chars', async () => {
      const { accessToken } = await registerAndLogin(testUser);

      const res = await request(app.getHttpServer())
        .post('/v1/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'AB' })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/v1/organizations')
        .send({ name: 'Acme Corp' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('GET /v1/organizations', () => {
    it('should list organizations where user is a member', async () => {
      const { accessToken } = await registerAndLogin(testUser);
      await createOrg(accessToken, 'Org One');
      await createOrg(accessToken, 'Org Two');

      const res = await request(app.getHttpServer())
        .get('/v1/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Organizations retrieved successfully.');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should return empty list for user with no organizations', async () => {
      const { accessToken } = await registerAndLogin(testUser);

      const res = await request(app.getHttpServer())
        .get('/v1/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('should support search filter', async () => {
      const { accessToken } = await registerAndLogin(testUser);
      await createOrg(accessToken, 'Acme Corp');
      await createOrg(accessToken, 'Beta Inc');

      const res = await request(app.getHttpServer())
        .get('/v1/organizations?search=acme')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Acme Corp');
    });
  });

  describe('GET /v1/organizations/:id', () => {
    it('should get organization details for a member', async () => {
      const { accessToken } = await registerAndLogin(testUser);
      const orgId = await createOrg(accessToken, 'Acme Corp');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.organization.name).toBe('Acme Corp');
      expect(res.body.data.organization.memberCount).toBe(1);
    });

    it('should return 403 for non-member', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: otherToken } = await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Private Org');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 404 for non-existent org', async () => {
      const { accessToken } = await registerAndLogin(testUser);

      await request(app.getHttpServer())
        .get('/v1/organizations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /v1/organizations/:id', () => {
    it('should allow OWNER to update name', async () => {
      const { accessToken } = await registerAndLogin(testUser);
      const orgId = await createOrg(accessToken, 'Old Name');

      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'New Name' })
        .expect(HttpStatus.OK);

      expect(res.body.data.organization.name).toBe('New Name');
    });

    it('should return 403 for MEMBER role', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: memberToken } = await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Test Org');

      // Add second user as MEMBER
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Hacked Name' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('DELETE /v1/organizations/:id', () => {
    it('should allow OWNER to soft delete', async () => {
      const { accessToken } = await registerAndLogin(testUser);
      const orgId = await createOrg(accessToken, 'Delete Me');

      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Verify soft deleted — should now return 404
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 403 for ADMIN', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: adminToken } = await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'No Delete');

      // Add second user as MEMBER, then promote to ADMIN
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      // Get member ID for role update
      const membersRes = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const adminMemberId = (
        membersRes.body.data as { id: string; user: { email: string } }[]
      ).find((m) => m.user.email === secondUser.email)?.id;

      await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${adminMemberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' });

      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // --- Membership ---

  describe('GET /v1/organizations/:id/members', () => {
    it('should list members', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should filter members by roles', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      // Test filtering by OWNER
      const resOwner = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members?roles=OWNER`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.OK);

      expect(resOwner.body.data).toHaveLength(1);
      expect(resOwner.body.data[0].role).toBe('OWNER');

      // Test filtering by MEMBER
      const resMember = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members?roles=MEMBER`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.OK);

      expect(resMember.body.data).toHaveLength(1);
      expect(resMember.body.data[0].role).toBe('MEMBER');

      // Test filtering by OWNER and MEMBER
      const resBoth = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members?roles=OWNER,MEMBER`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.OK);

      expect(resBoth.body.data).toHaveLength(2);
    });
  });

  describe('GET /v1/organizations/:id/members/user/:userId', () => {
    it('should get membership details for a specific user', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { userId: memberUserId } = await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members/user/${memberUserId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.role).toBe('MEMBER');
      expect(res.body.data.user.id).toBe(memberUserId);
    });

    it('should return 404 if member not found in organization', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { userId: nonMemberUserId } = await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members/user/${nonMemberUserId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });

  describe('POST /v1/organizations/:id/members', () => {
    it('should add member by email', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email })
        .expect(HttpStatus.CREATED);

      expect(res.body.data.member.role).toBe('MEMBER');
      expect(res.body.data.member.user.email).toBe(secondUser.email);
    });

    it('should return 409 for duplicate member', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email })
        .expect(HttpStatus.CONFLICT);

      expect(res.body.error.code).toBe('MEMBER_ALREADY_EXISTS');
    });

    it('should return 404 for non-existent user', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'ghost@email.com' })
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 403 for MEMBER role trying to add', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: memberToken } = await registerAndLogin(secondUser);
      await registerAndLogin(thirdUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      // Add second user as MEMBER
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      // MEMBER trying to add third user
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: thirdUser.email })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('PATCH /v1/organizations/:id/members/:memberId', () => {
    it('should allow OWNER to update role', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      // Add member
      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const memberId = addRes.body.data.member.id;

      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' })
        .expect(HttpStatus.OK);

      expect(res.body.data.member.role).toBe('ADMIN');
    });

    it('should return 403 for non-OWNER trying to update role', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: memberToken } = await registerAndLogin(secondUser);
      await registerAndLogin(thirdUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      // Add both users
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const addThird = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: thirdUser.email });

      const thirdMemberId = addThird.body.data.member.id;

      // MEMBER trying to change role
      await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${thirdMemberId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ role: 'ADMIN' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('DELETE /v1/organizations/:id/members/:memberId', () => {
    it('should allow self-leave', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: memberToken } = await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const memberId = addRes.body.data.member.id;

      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('You have left the organization.');
    });

    it('should prevent removing OWNER', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: adminToken } = await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      // Add admin
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      // Get member list to find OWNER memberId
      const membersRes = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const ownerMemberId = (
        membersRes.body.data as { id: string; role: string }[]
      ).find((m) => m.role === 'OWNER')?.id;

      // Promote second user to ADMIN
      const adminMemberId = (
        membersRes.body.data as { id: string; user: { email: string } }[]
      ).find((m) => m.user.email === secondUser.email)?.id;

      await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/members/${adminMemberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' });

      // ADMIN trying to remove OWNER
      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${ownerMemberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should allow OWNER to remove MEMBER', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Team Org');

      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const memberId = addRes.body.data.member.id;

      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Member removed successfully.');
    });
  });

  // --- Transfer Ownership ---

  describe('POST /v1/organizations/:id/transfer-ownership', () => {
    it('should transfer ownership successfully', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      await registerAndLogin(secondUser);
      const orgId = await createOrg(ownerToken, 'Transfer Org');

      // Add member
      const addRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const memberId = addRes.body.data.member.id;

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/transfer-ownership`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ memberId })
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Ownership transferred successfully.');

      // Verify: original owner should now be ADMIN
      const membersRes = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const newOwner = (
        membersRes.body.data as { role: string; user: { email: string } }[]
      ).find((m) => m.user.email === secondUser.email);
      const oldOwner = (
        membersRes.body.data as { role: string; user: { email: string } }[]
      ).find((m) => m.user.email === testUser.email);

      expect(newOwner?.role).toBe('OWNER');
      expect(oldOwner?.role).toBe('ADMIN');
    });

    it('should return 403 for non-OWNER', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const { accessToken: memberToken } = await registerAndLogin(secondUser);
      await registerAndLogin(thirdUser);
      const orgId = await createOrg(ownerToken, 'No Transfer');

      // Add second and third users
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: secondUser.email });

      const addThird = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: thirdUser.email });

      const thirdMemberId = addThird.body.data.member.id;

      // MEMBER trying to transfer
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/transfer-ownership`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ memberId: thirdMemberId })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 for non-existent target member', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(testUser);
      const orgId = await createOrg(ownerToken, 'Transfer Org');

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/transfer-ownership`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ memberId: '00000000-0000-0000-0000-000000000000' })
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
    });
  });
});
