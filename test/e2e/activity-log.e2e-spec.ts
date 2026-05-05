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
import { ActivityLogModule } from '../../src/modules/activity-log/activity-log.module';
import { ElasticsearchModule } from '../../src/modules/elasticsearch/elasticsearch.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('Activity Logs (e2e)', () => {
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
        ActivityLogModule,
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
    await prisma.activityLog.deleteMany();
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
    name: 'AL Owner',
    email: 'al-owner@test.com',
    password: 'securepassword123',
  };

  const memberUser = {
    name: 'AL Member',
    email: 'al-member@test.com',
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

  // --- Tests ---

  describe('GET /v1/organizations/:id/activity-logs', () => {
    it('should return 200 with empty logs for a new org', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Test Org');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.message).toBe('Activity logs retrieved successfully.');
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
    });

    it('should generate activity logs when member actions occur', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'Log Org');

      // Perform an action that generates a log: add a member
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: memberUser.email })
        .expect(HttpStatus.CREATED);

      // Allow async event handler to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(HttpStatus.OK);

      // Should have at least one log entry (member.added)
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const memberAddedLog = res.body.data.find(
        (l: { action: string }) => l.action === 'member.added',
      );
      expect(memberAddedLog).toBeDefined();
      expect(memberAddedLog.targetType).toBe('member');
      expect(memberAddedLog.actor).toBeDefined();
      expect(memberAddedLog.actor.name).toBe(ownerUser.name);
    });

    it('should support pagination', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Paginated Org');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs?page=1&limit=5`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(5);
    });

    it('should support action filter', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Filter Org');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs?action=member.added`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should support targetType filter', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Type Filter Org');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs?targetType=version`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('should return 403 for MEMBER role', async () => {
      const { accessToken: ownerToken } = await registerAndLogin(ownerUser);
      const { accessToken: memberToken } = await registerAndLogin(memberUser);
      const orgId = await createOrg(ownerToken, 'RBAC Org');

      // Add member
      await request(app.getHttpServer())
        .post(`/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: memberUser.email })
        .expect(HttpStatus.CREATED);

      // Member should NOT be able to access activity logs
      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 401 without authentication', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Auth Org');

      await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should support sort order', async () => {
      const { accessToken } = await registerAndLogin(ownerUser);
      const orgId = await createOrg(accessToken, 'Sort Org');

      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${orgId}/activity-logs?sortOrder=asc`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data).toBeInstanceOf(Array);
    });
  });
});
