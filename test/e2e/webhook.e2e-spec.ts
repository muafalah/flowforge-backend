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
import { WebhookModule } from '../../src/modules/webhook/webhook.module';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('Webhooks (e2e)', () => {
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
        WebhookModule,
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
    email: 'wh-owner@test.com',
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

  async function setupWorkflowWithActiveVersion(token: string) {
    const orgId = await createOrg(token, 'WH Test Org');
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
      .send({ name: 'WH Test WF' });
    const wfId = wfRes.body.data.workflow.id as string;

    const verRes = await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/workflows/${wfId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ definition: validDag });
    const verId = verRes.body.data.version.id as string;

    await request(app.getHttpServer())
      .post(
        `/v1/organizations/${orgId}/workflows/${wfId}/versions/${verId}/activate`,
      )
      .set('Authorization', `Bearer ${token}`);

    return { orgId, wfId };
  }

  // --- Webhook CRUD ---

  describe('Webhook CRUD', () => {
    it('should create a webhook', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'GitHub Hook' })
        .expect(HttpStatus.CREATED);

      expect(res.body.message).toBe('Webhook created successfully.');
      expect(res.body.data.webhook.name).toBe('GitHub Hook');
      expect(res.body.data.webhook.secret).toBeTruthy();
      expect(res.body.data.webhook.webhookUrl).toContain('/v1/webhooks/');
    });

    it('should list webhooks', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Hook 1' });
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Hook 2' });

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should update a webhook', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Original' });
      const whId = createRes.body.data.webhook.id;

      const res = await request(app.getHttpServer())
        .patch(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks/${whId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated' })
        .expect(HttpStatus.OK);

      expect(res.body.data.webhook.name).toBe('Updated');
    });

    it('should delete a webhook', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Delete Me' });
      const whId = createRes.body.data.webhook.id;

      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks/${whId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Webhook deleted successfully.');
    });
  });

  // --- Public Webhook Receiver ---

  describe('POST /v1/webhooks/:urlPath', () => {
    it('should trigger a run via webhook with valid secret', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Trigger Hook' });

      const { urlPath, secret } = createRes.body.data.webhook;

      const res = await request(app.getHttpServer())
        .post(`/v1/webhooks/${urlPath}`)
        .set('X-Webhook-Secret', secret as string)
        .send({ event: 'push' })
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Webhook received. Run triggered.');
      expect(res.body.runId).toBeTruthy();
    });

    it('should reject invalid secret', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const { orgId, wfId } = await setupWorkflowWithActiveVersion(accessToken);

      const createRes = await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/workflows/${wfId}/webhooks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Reject Hook' });

      const { urlPath } = createRes.body.data.webhook;

      await request(app.getHttpServer())
        .post(`/v1/webhooks/${urlPath}`)
        .set('X-Webhook-Secret', 'wrong-secret')
        .send({})
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should reject non-existent webhook URL', async () => {
      await request(app.getHttpServer())
        .post('/v1/webhooks/nonexistent-path')
        .set('X-Webhook-Secret', 'any')
        .send({})
        .expect(HttpStatus.NOT_FOUND);
    });
  });
});
