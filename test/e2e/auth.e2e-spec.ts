import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/database/prisma.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../src/database/database.module';
import { AuthModule } from '../../src/modules/auth/auth.module';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/**
 * E2E tests for the authentication endpoints.
 * We build a test module WITHOUT ThrottlerModule to avoid rate limiting in tests.
 */
describe('Auth Endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await prisma.activityLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    // Final cleanup
    await prisma.activityLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  const testUser = {
    name: 'Test User',
    email: 'test@email.com',
    password: 'securepassword123',
  };

  /** Helper to register and login, returning tokens */
  async function registerAndLogin(): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send(testUser)
      .expect(HttpStatus.CREATED);

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
    };
  }

  describe('POST /v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(testUser)
        .expect(HttpStatus.CREATED);

      expect(response.body).toEqual({
        message: 'Account created successfully.',
        data: {
          user: {
            id: expect.any(String) as string,
            name: testUser.name,
            email: testUser.email,
          },
        },
      });

      // Ensure password is never returned
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should return error for duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(testUser)
        .expect(HttpStatus.CREATED);

      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(testUser)
        .expect(HttpStatus.CONFLICT);

      expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should return validation error for invalid input', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          name: '',
          email: 'invalid-email',
          password: 'short',
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields).toBeDefined();
    });

    it('should return validation error for missing fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /v1/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(testUser);
    });

    it('should login successfully and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(HttpStatus.OK);

      expect(response.body.message).toBe('Login successful.');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.user).toEqual({
        id: expect.any(String) as string,
        name: testUser.name,
        email: testUser.email,
      });
    });

    it('should return error for non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent@email.com',
          password: 'somepassword1',
        })
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return error for wrong password', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /v1/auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      const tokens = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(HttpStatus.OK);

      expect(response.body.message).toBe('Token refreshed successfully.');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
    });

    it('should reject an invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });

    it('should reject a used/rotated refresh token after delay', async () => {
      const tokens = await registerAndLogin();

      // Wait 1 second so new JWT has a different iat timestamp
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Use the token once (rotation)
      const refreshResponse = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(HttpStatus.OK);

      // Verify the new token is actually different
      expect(refreshResponse.body.data.refreshToken).not.toBe(
        tokens.refreshToken,
      );

      // Try to use the old token again — session was rotated
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });
  });

  describe('GET /v1/auth/me', () => {
    it('should return user profile with valid token', async () => {
      const tokens = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.message).toBe('User retrieved successfully.');
      expect(response.body.data.user).toEqual({
        id: expect.any(String) as string,
        name: testUser.name,
        email: testUser.email,
      });
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const tokens = await registerAndLogin();

      const response = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: tokens.refreshToken })
        .expect(HttpStatus.OK);

      expect(response.body.message).toBe('Logged out successfully.');
    });

    it('should not be able to refresh after logout', async () => {
      const tokens = await registerAndLogin();

      // Logout
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: tokens.refreshToken })
        .expect(HttpStatus.OK);

      // Try to refresh with the invalidated token
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });

    it('should succeed even with non-existent token (idempotent)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: 'nonexistent_token' })
        .expect(HttpStatus.OK);
    });
  });
});
