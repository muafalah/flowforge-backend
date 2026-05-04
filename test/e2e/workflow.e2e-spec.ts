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
import { WorkflowModule } from '../../src/modules/workflow/workflow.module';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('Workflow & Versions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
        OrganizationModule,
        WorkflowModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await prisma.workflowVersion.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.workflowVersion.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  // --- Helpers ---

  const ownerUser = {
    name: 'Owner',
    email: 'owner@test.com',
    password: 'pass12345678',
  };
  const memberUser = {
    name: 'Member',
    email: 'member@test.com',
    password: 'pass12345678',
  };

  async function registerAndLogin(user: {
    name: string;
    email: string;
    password: string;
  }) {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(user)
      .expect(HttpStatus.CREATED);
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(HttpStatus.OK);
    return { accessToken: res.body.data.accessToken as string };
  }

  async function createOrg(token: string, name: string) {
    const res = await request(app.getHttpServer())
      .post('/v1/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(HttpStatus.CREATED);
    return res.body.data.organization.id as string;
  }

  async function addMember(token: string, orgId: string, email: string) {
    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email });
  }

  const validDag = {
    nodes: [
      { id: 'step1', type: 'http' },
      { id: 'step2', type: 'script' },
      { id: 'step3', type: 'transform' },
    ],
    edges: [
      { from: 'step1', to: 'step2' },
      { from: 'step2', to: 'step3' },
    ],
  };

  // --- Workflow CRUD ---

  describe('POST /v1/organizations/:orgId/workflows', () => {
    it('should create a workflow', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Data Pipeline', description: 'Sync data.' })
        .expect(HttpStatus.CREATED);

      expect(res.body.message).toBe('Workflow created successfully.');
      expect(res.body.data.workflow.name).toBe('Data Pipeline');
      expect(res.body.data.workflow.status).toBe('DRAFT');
      expect(res.body.data.workflow.organizationId).toBe(orgId);
    });

    it('should return 403 for MEMBER role', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: memberToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Test Org');
      await addMember(ownerToken, orgId, memberUser.email);

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Blocked' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 400 for invalid name', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'AB' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/organizations/:orgId/workflows', () => {
    it('should list workflows with pagination', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Pipeline 1' });
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Pipeline 2' });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should filter by search', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Data Sync' });
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Email Notify' });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows?search=data`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Data Sync');
    });

    it('should not show workflows from another organization', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId1 = await createOrg(accessToken, 'Org One');
      const orgId2 = await createOrg(accessToken, 'Org Two');

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId1}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Org1 WF' });
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId2}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Org2 WF' });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId1}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Org1 WF');
    });
  });

  describe('GET /v1/organizations/:orgId/workflows/:workflowId', () => {
    it('should return workflow details', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Detail Test' });

      const workflowId = createRes.body.data.workflow.id;

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.workflow.name).toBe('Detail Test');
      expect(res.body.data.workflow.creator).toBeDefined();
    });

    it('should return 404 for non-existent workflow', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      await request(app.getHttpServer())
        .get(
          `/v1/organizations/${orgId}/workflows/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /v1/organizations/:orgId/workflows/:workflowId', () => {
    it('should update workflow fields', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Old Name' });

      const workflowId = createRes.body.data.workflow.id;

      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'New Name', status: 'ACTIVE' })
        .expect(HttpStatus.OK);

      expect(res.body.data.workflow.name).toBe('New Name');
      expect(res.body.data.workflow.status).toBe('ACTIVE');
    });
  });

  describe('DELETE /v1/organizations/:orgId/workflows/:workflowId', () => {
    it('should soft delete a workflow', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Delete Me' });

      const workflowId = createRes.body.data.workflow.id;

      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Should now return 404
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // --- Workflow Versions ---

  describe('POST /v1/organizations/:orgId/workflows/:wfId/versions', () => {
    it('should create a version with valid DAG and return execution order', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'V Test' });
      const wfId = wfRes.body.data.workflow.id;

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: validDag })
        .expect(HttpStatus.CREATED);

      expect(res.body.message).toBe('Version created successfully.');
      expect(res.body.data.version.version).toBe(1);
      expect(res.body.data.version.executionOrder).toEqual([
        'step1',
        'step2',
        'step3',
      ]);
    });

    it('should auto-increment version numbers', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'V Test' });
      const wfId = wfRes.body.data.workflow.id;

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: validDag });
      const res2 = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: validDag });

      expect(res2.body.data.version.version).toBe(2);
    });

    it('should reject a cyclic DAG', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Cycle Test' });
      const wfId = wfRes.body.data.workflow.id;

      const cyclicDag = {
        nodes: [
          { id: 'A', type: 'http' },
          { id: 'B', type: 'script' },
        ],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'B', to: 'A' },
        ],
      };

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: cyclicDag })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.error.code).toBe('INVALID_DAG');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('should reject duplicate node IDs', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Dup Test' });
      const wfId = wfRes.body.data.workflow.id;

      const dupDag = {
        nodes: [
          { id: 'X', type: 'http' },
          { id: 'X', type: 'script' },
        ],
        edges: [],
      };

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: dupDag })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.error.code).toBe('INVALID_DAG');
    });

    it('should reject invalid edge references', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Ref Test' });
      const wfId = wfRes.body.data.workflow.id;

      const badRefDag = {
        nodes: [{ id: 'A', type: 'http' }],
        edges: [{ from: 'A', to: 'nonexistent' }],
      };

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: badRefDag })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.error.code).toBe('INVALID_DAG');
    });
  });

  describe('GET /v1/organizations/:orgId/workflows/:wfId/versions', () => {
    it('should list versions', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'List V' });
      const wfId = wfRes.body.data.workflow.id;

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: validDag });
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: validDag });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('POST /v1/organizations/:orgId/workflows/:wfId/versions/:vId/activate', () => {
    it('should activate a version and update workflow pointer', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Act Test' });
      const wfId = wfRes.body.data.workflow.id;

      const v1Res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: validDag });
      const v2Res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ definition: validDag });
      const v1Id = v1Res.body.data.version.id;
      const v2Id = v2Res.body.data.version.id;

      // Activate v1
      const actRes = await request(app.getHttpServer())
        .post(
          `/v1/organizations/${orgId}/workflows/${wfId}/versions/${v1Id}/activate`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(actRes.body.message).toBe('Version activated successfully.');
      expect(actRes.body.data.version.isActive).toBe(true);

      // Verify workflow detail shows active version
      const wfDetail = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(wfDetail.body.data.workflow.activeVersion.id).toBe(v1Id);

      // Activate v2 — v1 should become inactive
      await request(app.getHttpServer())
        .post(
          `/v1/organizations/${orgId}/workflows/${wfId}/versions/${v2Id}/activate`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const wfDetail2 = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(wfDetail2.body.data.workflow.activeVersion.id).toBe(v2Id);
    });

    it('should return 404 for non-existent version', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Act 404' });
      const wfId = wfRes.body.data.workflow.id;

      await request(app.getHttpServer())
        .post(
          `/v1/organizations/${orgId}/workflows/${wfId}/versions/00000000-0000-0000-0000-000000000000/activate`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // --- WorkflowAccessGuard: role + access tests ---

  describe('WorkflowAccessGuard — MEMBER role scenarios', () => {
    it('should allow MEMBER to update workflow when access is EDITOR', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: memberToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Test Org');
      await addMember(ownerToken, orgId, memberUser.email);

      // Create workflow with EDITOR access (default)
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Editor WF', access: 'EDITOR' });
      const wfId = wfRes.body.data.workflow.id;

      // MEMBER should be able to update
      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Updated by Member' })
        .expect(HttpStatus.OK);

      expect(res.body.data.workflow.name).toBe('Updated by Member');
    });

    it('should deny MEMBER from updating workflow when access is VIEWER', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: memberToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Test Org');
      await addMember(ownerToken, orgId, memberUser.email);

      // Create workflow with VIEWER access
      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Viewer WF', access: 'VIEWER' });
      const wfId = wfRes.body.data.workflow.id;

      // MEMBER should be denied
      await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Should Fail' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should deny MEMBER from deleting workflow when access is VIEWER', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: memberToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Test Org');
      await addMember(ownerToken, orgId, memberUser.email);

      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Viewer Delete', access: 'VIEWER' });
      const wfId = wfRes.body.data.workflow.id;

      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should allow MEMBER to delete workflow when access is EDITOR', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: memberToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Test Org');
      await addMember(ownerToken, orgId, memberUser.email);

      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Editor Delete', access: 'EDITOR' });
      const wfId = wfRes.body.data.workflow.id;

      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(HttpStatus.OK);
    });

    it('should deny MEMBER from creating a version on VIEWER workflow', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: memberToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Test Org');
      await addMember(ownerToken, orgId, memberUser.email);

      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Viewer Version', access: 'VIEWER' });
      const wfId = wfRes.body.data.workflow.id;

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ definition: validDag })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // --- Additional edge cases ---

  describe('Additional edge-case scenarios', () => {
    it('should filter workflows by status', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      // Create two workflows
      const wf1Res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Draft WF' });
      const wf1Id = wf1Res.body.data.workflow.id;

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Active WF' });

      // Update first workflow to ACTIVE
      await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/workflows/${wf1Id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'ACTIVE' });

      // Filter by ACTIVE
      const activeRes = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows?status=ACTIVE`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(activeRes.body.data).toHaveLength(1);
      expect(activeRes.body.data[0].status).toBe('ACTIVE');

      // Filter by DRAFT
      const draftRes = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows?status=DRAFT`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(draftRes.body.data).toHaveLength(1);
      expect(draftRes.body.data[0].status).toBe('DRAFT');
    });

    it('should return 404 when updating a deleted workflow', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Will Delete' });
      const wfId = wfRes.body.data.workflow.id;

      // Soft delete
      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Attempt update
      await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Should Fail' })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should deny non-member from listing workflows', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: outsiderToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Test Org');

      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should support pagination correctly', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      // Create 3 workflows
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post(`/v1/organizations/${orgId}/workflows`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name: `WF ${i + 1}` });
      }

      // Get page 1 with limit 2
      const page1 = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows?page=1&limit=2`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.meta.total).toBe(3);
      expect(page1.body.meta.page).toBe(1);

      // Get page 2
      const page2 = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows?page=2&limit=2`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.meta.page).toBe(2);
    });
  });
});
