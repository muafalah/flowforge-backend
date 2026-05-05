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
import { CronJobModule } from '../../src/modules/cron-job/cron-job.module';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('Cron Jobs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
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
        CronJobModule,
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
    await prisma.cronJob.deleteMany();
    await prisma.webhookTrigger.deleteMany();
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
    await prisma.cronJob.deleteMany();
    await prisma.webhookTrigger.deleteMany();
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
    email: 'cron-owner@test.com',
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

  async function setupWorkflow(token: string) {
    const orgId = await createOrg(token, 'Cron Test Org');
    const validDag = {
      nodes: [
        {
          id: 'step1',
          name: 'Delay',
          type: 'delay',
          config: { durationMs: 100 },
        },
      ],
      edges: [],
    };

    const wfRes = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/workflows`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cron Test WF' });
    const wfId = wfRes.body.data.workflow.id as string;

    // Create and activate a version
    const verRes = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ definition: validDag });
    const verId = verRes.body.data.version.id as string;

    await request(app.getHttpServer())
      .post(
        `/v1/organizations/${orgId}/workflows/${wfId}/versions/${verId}/activate`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(HttpStatus.OK);

    return { orgId, wfId };
  }

  // --- Tests ---

  describe('POST /v1/organizations/:orgId/workflows/:wfId/cron-jobs', () => {
    it('should create a cron job successfully', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Daily Job',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.message).toBe('Cron job created successfully.');
      expect(res.body.data.cronJob.name).toBe('Daily Job');
      expect(res.body.data.cronJob.cronExpression).toBe('0 0 * * *');
      expect(res.body.data.cronJob.isActive).toBe(true);
    });

    it('should reject unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/v1/organizations/org-1/workflows/wf-1/cron-jobs')
        .send({
          name: 'Test',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 for non-existent workflow', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      await request(app.getHttpServer())
        .post(
          `/v1/organizations/${orgId}/workflows/00000000-0000-0000-0000-000000000000/cron-jobs`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /v1/organizations/:orgId/workflows/:wfId/cron-jobs', () => {
    it('should list cron jobs with pagination', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      // Create 2 cron jobs
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Job 1',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        });
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Job 2',
          cronExpression: '*/30 * * * *',
          timezone: 'UTC',
        });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should return empty list when no cron jobs exist', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });
  });

  describe('PATCH /v1/organizations/:orgId/workflows/:wfId/cron-jobs/:cronJobId', () => {
    it('should update a cron job', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Original',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        });
      const cronJobId = createRes.body.data.cronJob.id;

      const res = await request(app.getHttpServer())
        .patch(
          `/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs/${cronJobId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated', cronExpression: '*/10 * * * *' })
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Cron job updated successfully.');
      expect(res.body.data.cronJob.name).toBe('Updated');
    });

    it('should toggle isActive flag', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Toggle Me',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        });
      const cronJobId = createRes.body.data.cronJob.id;

      const res = await request(app.getHttpServer())
        .patch(
          `/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs/${cronJobId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ isActive: false })
        .expect(HttpStatus.OK);

      expect(res.body.data.cronJob.isActive).toBe(false);
    });

    it('should return 404 for non-existent cron job', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      await request(app.getHttpServer())
        .patch(
          `/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'x' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /v1/organizations/:orgId/workflows/:wfId/cron-jobs/:cronJobId', () => {
    it('should delete a cron job', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Delete Me',
          cronExpression: '0 0 * * *',
          timezone: 'UTC',
        });
      const cronJobId = createRes.body.data.cronJob.id;

      const res = await request(app.getHttpServer())
        .delete(
          `/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs/${cronJobId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Cron job deleted successfully.');

      // Verify it's gone
      const listRes = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(listRes.body.data).toHaveLength(0);
    });

    it('should return 404 for non-existent cron job', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflow(accessToken);

      await request(app.getHttpServer())
        .delete(
          `/v1/organizations/${orgId}/workflows/${wfId}/cron-jobs/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
