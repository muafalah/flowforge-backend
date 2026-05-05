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
import { DashboardModule } from '../../src/modules/dashboard/dashboard.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

describe('Dashboard (e2e)', () => {
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
        WorkflowModule,
        DashboardModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await prisma.activityLog.deleteMany();
    await prisma.workflowRun.deleteMany();
    await prisma.workflowVersion.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany();
    await prisma.workflowRun.deleteMany();
    await prisma.workflowVersion.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const ownerUser = {
    name: 'Owner',
    email: 'dash-own@test.com',
    password: 'pass12345678',
  };
  const memberUser = {
    name: 'Member',
    email: 'dash-mem@test.com',
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

  async function createWorkflow(token: string, orgId: string, name: string) {
    const res = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/workflows`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(HttpStatus.CREATED);
    return res.body.data.workflow.id as string;
  }

  // --- Stats ---
  describe('GET /v1/organizations/:id/dashboard/stats', () => {
    it('should return stats shape for a new org', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Stats Org');
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/stats`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.message).toBe('Dashboard stats retrieved successfully.');
      expect(res.body.data.activeRuns).toBe(0);
      expect(res.body.data.totalRuns24h).toBe(0);
      expect(res.body.data.hourlyRuns).toHaveLength(24);
    });

    it('should reflect workflow count', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'WF Org');
      await createWorkflow(accessToken, orgId, 'WF A');
      await createWorkflow(accessToken, orgId, 'WF B');
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/stats`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.data.totalWorkflows).toBe(2);
    });

    it('should return 401 without token', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Auth Org');
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/stats`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 for non-member', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: outsiderToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Iso Org');
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/stats`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should isolate stats between orgs', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId1 = await createOrg(accessToken, 'Org1');
      const orgId2 = await createOrg(accessToken, 'Org2');
      await createWorkflow(accessToken, orgId1, 'Workflow Alpha');
      await createWorkflow(accessToken, orgId1, 'Workflow Beta');
      await createWorkflow(accessToken, orgId2, 'Workflow Gamma');
      const r1 = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId1}/dashboard/stats`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      const r2 = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId2}/dashboard/stats`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(r1.body.data.totalWorkflows).toBe(2);
      expect(r2.body.data.totalWorkflows).toBe(1);
    });
  });

  // --- Recent Runs ---
  describe('GET /v1/organizations/:id/dashboard/recent-runs', () => {
    it('should return empty runs for a new org', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Runs Org');
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/recent-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
      expect(res.body.meta.page).toBe(1);
    });

    it('should support pagination params', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Page Org');
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/recent-runs?page=2&limit=5`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.limit).toBe(5);
    });

    it('should support status filter', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Filter Org');
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/recent-runs?status=SUCCESS`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should return 401 without token', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Auth R Org');
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/recent-runs`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 for non-member', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: outsiderToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Iso R Org');
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/recent-runs`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // --- Workflow Summary ---
  describe('GET /v1/organizations/:id/dashboard/workflow-summary', () => {
    it('should return empty for a new org', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Sum Org');
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/workflow-summary`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.message).toBe('Workflow summary retrieved successfully.');
      expect(res.body.data).toHaveLength(0);
    });

    it('should return workflows with correct shape', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Shape Org');
      await createWorkflow(accessToken, orgId, 'Pipeline');
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/workflow-summary`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('name', 'Pipeline');
      expect(res.body.data[0]).toHaveProperty('lastRunStatus');
      expect(res.body.data[0]).toHaveProperty('totalRuns24h');
      expect(res.body.data[0]).toHaveProperty('successCount24h');
      expect(res.body.data[0]).toHaveProperty('activeVersionDefinition');
    });

    it('should isolate workflows between orgs', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const o1 = await createOrg(accessToken, 'SO1');
      const o2 = await createOrg(accessToken, 'SO2');
      await createWorkflow(accessToken, o1, 'Pipeline One');
      await createWorkflow(accessToken, o2, 'Pipeline Two');
      await createWorkflow(accessToken, o2, 'Pipeline Three');
      const r1 = await request(app.getHttpServer())
        .get(`/v1/organizations/${o1}/dashboard/workflow-summary`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      const r2 = await request(app.getHttpServer())
        .get(`/v1/organizations/${o2}/dashboard/workflow-summary`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(r1.body.data).toHaveLength(1);
      expect(r2.body.data).toHaveLength(2);
    });

    it('should return 401 without token', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Auth S Org');
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/workflow-summary`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 403 for non-member', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: outsiderToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Iso S Org');
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/workflow-summary`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should not include soft-deleted workflows', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Del Org');
      const wfId = await createWorkflow(accessToken, orgId, 'To Delete');
      await createWorkflow(accessToken, orgId, 'Keep');
      await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/workflows/${wfId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/dashboard/workflow-summary`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Keep');
    });
  });
});
