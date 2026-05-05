import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/database/prisma.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../src/database/database.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UserModule } from '../../src/modules/user/user.module';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/**
 * E2E tests for the user endpoints.
 * Built without ThrottlerModule to avoid rate limiting in tests.
 */
describe('User Endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
        UserModule,
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

  const testUser = {
    name: 'Test User',
    email: 'test@email.com',
    password: 'securepassword123',
  };

  /** Helper to register and login, returning tokens and user id */
  async function registerAndLogin(): Promise<{
    accessToken: string;
    refreshToken: string;
    userId: string;
  }> {
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(testUser)
      .expect(HttpStatus.CREATED);

    const userId = registerResponse.body.data.user.id as string;

    const loginResponse = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(HttpStatus.OK);

    return {
      accessToken: loginResponse.body.data.accessToken as string,
      refreshToken: loginResponse.body.data.refreshToken as string,
      userId,
    };
  }

  describe('PATCH /v1/user/:id', () => {
    it('should update user name successfully', async () => {
      const { accessToken, userId } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .patch(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Name' })
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        message: 'User updated successfully.',
        data: {
          user: {
            id: userId,
            name: 'Updated Name',
            email: testUser.email,
          },
        },
      });
    });

    it('should persist updated name across requests', async () => {
      const { accessToken, userId } = await registerAndLogin();

      await request(app.getHttpServer())
        .patch(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Persisted Name' })
        .expect(HttpStatus.OK);

      // Verify name is persisted by fetching user from DB
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.name).toBe('Persisted Name');
    });

    it('should return 404 for non-existent user id', async () => {
      const { accessToken } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .patch('/v1/user/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'New Name' })
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 401 without authentication token', async () => {
      await request(app.getHttpServer())
        .patch('/v1/user/some-id')
        .send({ name: 'New Name' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 with invalid authentication token', async () => {
      await request(app.getHttpServer())
        .patch('/v1/user/some-id')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({ name: 'New Name' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return validation error for empty name', async () => {
      const { accessToken, userId } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .patch(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '' })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields).toBeDefined();
    });

    it('should return validation error for missing name', async () => {
      const { accessToken, userId } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .patch(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return validation error for name exceeding max length', async () => {
      const { accessToken, userId } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .patch(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'A'.repeat(101) })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should not expose sensitive fields in response', async () => {
      const { accessToken, userId } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .patch(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Safe Name' })
        .expect(HttpStatus.OK);

      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.body.data.user.password).toBeUndefined();
      expect(response.body.data.user.deletedAt).toBeUndefined();
    });
  });

  describe('DELETE /v1/user/:id', () => {
    it('should delete user successfully', async () => {
      const { accessToken, userId } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .delete(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        message: 'User deleted successfully.',
      });

      // Verify soft delete in DB
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.deletedAt).not.toBeNull();
    });

    it('should return 401 if user is already deleted (token revoked)', async () => {
      const { accessToken, userId } = await registerAndLogin();

      // First delete
      await request(app.getHttpServer())
        .delete(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Second delete (should fail with 401 because token is now revoked)
      await request(app.getHttpServer())
        .delete(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .delete('/v1/user/some-id')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 for non-existent user', async () => {
      const { accessToken } = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .delete('/v1/user/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should immediately revoke access for existing tokens after deletion', async () => {
      const { accessToken, userId } = await registerAndLogin();

      // Verify token works
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Delete user
      await request(app.getHttpServer())
        .delete(`/v1/user/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Verify token is now revoked
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
