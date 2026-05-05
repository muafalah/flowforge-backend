import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/database/prisma.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../../src/database/database.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { OrganizationModule } from '../../src/modules/organization/organization.module';
import { WorkflowModule } from '../../src/modules/workflow/workflow.module';
import { ElasticsearchModule } from '../../src/modules/elasticsearch/elasticsearch.module';
import { WorkflowExecutionModule } from '../../src/modules/workflow-execution/workflow-execution.module';
import { WorkflowRunModule } from '../../src/modules/workflow-run/workflow-run.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('Workflow Runs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        }),
        DatabaseModule,
        ElasticsearchModule,
        AuthModule,
        OrganizationModule,
        WorkflowModule,
        WorkflowExecutionModule,
        WorkflowRunModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await prisma.workflowRunStep.deleteMany();
    await prisma.workflowRun.deleteMany();
    await prisma.workflowVersion.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.workflowRunStep.deleteMany();
    await prisma.workflowRun.deleteMany();
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
    email: 'run-owner@test.com',
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

  const validDag = {
    nodes: [
      {
        id: 'step1',
        name: 'Delay Node',
        type: 'delay',
        config: { durationMs: 100 },
      },
    ],
    edges: [],
  };

  async function setupWorkflowWithActiveVersion(token: string) {
    const orgId = await createOrg(token, 'Run Test Org');

    // Create workflow
    const wfRes = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/workflows`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Run Test WF' });
    const wfId = wfRes.body.data.workflow.id as string;

    // Create version
    const verRes = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ definition: validDag });
    const verId = verRes.body.data.version.id as string;

    // Activate version
    await request(app.getHttpServer())
      .post(
        `/v1/organizations/${orgId}/workflows/${wfId}/versions/${verId}/activate`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(HttpStatus.OK);

    return { orgId, wfId, verId };
  }

  // --- Tests ---

  describe('POST /v1/organizations/:orgId/workflows/:wfId/runs', () => {
    it('should trigger a manual run successfully', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.CREATED);

      expect(res.body.message).toBe('Workflow run triggered successfully.');
      expect(res.body.data.run.status).toBe('PENDING');
      expect(res.body.data.run.triggerType).toBe('MANUAL');
    });

    it('should return 404 for non-existent workflow', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      await request(app.getHttpServer())
        .post(
          `/v1/organizations/${orgId}/workflows/00000000-0000-0000-0000-000000000000/runs`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 when no active version', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      const wfRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'No Version WF' });
      const wfId = wfRes.body.data.workflow.id;

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.error.code).toBe('NO_ACTIVE_VERSION');
    });
  });

  describe('GET /v1/organizations/:orgId/workflows/:wfId/runs', () => {
    it('should list runs with pagination', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      // Trigger 2 runs
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`);
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Runs retrieved successfully.');
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/runs?status=PENDING`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      for (const run of res.body.data) {
        expect(run.status).toBe('PENDING');
      }
    });
  });

  describe('GET /v1/organizations/:orgId/workflows/:wfId/runs/:runId', () => {
    it('should return run details with steps', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const triggerRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`);
      const runId = triggerRes.body.data.run.id;

      // Wait briefly for BullMQ to process
      await new Promise((r) => setTimeout(r, 2000));

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/runs/${runId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Run retrieved successfully.');
      expect(res.body.data.run.id).toBe(runId);
    });

    it('should return 404 for non-existent run', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      await request(app.getHttpServer())
        .get(
          `/v1/organizations/${orgId}/workflows/${wfId}/runs/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /v1/organizations/:orgId/workflows/:wfId/runs/:runId/cancel', () => {
    it('should cancel a pending run', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const triggerRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`);
      const runId = triggerRes.body.data.run.id;

      const res = await request(app.getHttpServer())
        .post(
          `/v1/organizations/${orgId}/workflows/${wfId}/runs/${runId}/cancel`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Run cancellation requested.');
    });
  });

  describe('GET /v1/organizations/:orgId/workflows/:wfId/runs/:runId/logs', () => {
    it('should return logs (may be empty initially)', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const triggerRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/runs`)
        .set('Authorization', `Bearer ${accessToken}`);
      const runId = triggerRes.body.data.run.id;

      // Wait a bit for execution + ES indexing
      await new Promise((r) => setTimeout(r, 3000));

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/runs/${runId}/logs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Logs retrieved successfully.');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });
  });
});
