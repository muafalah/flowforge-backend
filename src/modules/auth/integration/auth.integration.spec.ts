import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { AuthModule } from '../auth.module';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../database/prisma.service';
import type { Request } from 'express';

/**
 * Integration tests for AuthService.
 *
 * Unlike unit tests, these use a REAL database (flowforge_integration)
 * and real dependencies (JwtService, bcrypt, PrismaService).
 * Only external I/O boundaries are NOT tested (e.g., no HTTP).
 */
describe('AuthService (integration)', () => {
  let service: AuthService;
  let prisma: PrismaService;

  const mockReq = {
    headers: { 'user-agent': 'integration-test' },
    ip: '127.0.0.1',
  } as unknown as Request;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuthModule,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.session.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    // Final cleanup
    await prisma.session.deleteMany();
    await prisma.organizationMember.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  const testUser = {
    name: 'Integration User',
    email: 'integration@email.com',
    password: 'securepassword123',
  };

  // --- Register + Login Flow ---

  describe('register → login → getProfile flow', () => {
    it('should register a user, login, and retrieve the profile', async () => {
      // 1. Register
      const registerResult = await service.register(testUser);
      expect(registerResult.message).toBe('Account created successfully.');
      expect(registerResult.data.user.email).toBe(testUser.email);
      expect(registerResult.data.user.name).toBe(testUser.name);
      const userId = registerResult.data.user.id;

      // 2. Login
      const loginResult = await service.login(
        { email: testUser.email, password: testUser.password },
        mockReq,
      );
      expect(loginResult.message).toBe('Login successful.');
      expect(loginResult.data.accessToken).toBeDefined();
      expect(loginResult.data.refreshToken).toBeDefined();
      expect(loginResult.data.user.id).toBe(userId);

      // 3. Verify session was created in DB
      const sessions = await prisma.session.findMany({
        where: { userId },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].accessToken).toBe(loginResult.data.accessToken);

      // 4. Get profile
      const profileResult = await service.getProfile({
        userId,
        name: testUser.name,
        email: testUser.email,
      });
      expect(profileResult.data.user.id).toBe(userId);
      expect(profileResult.data.user.email).toBe(testUser.email);
    });
  });

  // --- Token Refresh Flow ---

  describe('login → refresh → verify rotation', () => {
    it('should rotate tokens correctly', async () => {
      // Setup: register & login
      await service.register(testUser);
      const loginResult = await service.login(
        { email: testUser.email, password: testUser.password },
        mockReq,
      );

      const originalRefreshToken = loginResult.data.refreshToken;

      // Wait for the JWT `iat` to change (same-second tokens produce identical signatures)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Refresh token
      const refreshResult = await service.refreshToken({
        refreshToken: originalRefreshToken,
      });
      expect(refreshResult.data.accessToken).toBeDefined();
      expect(refreshResult.data.refreshToken).toBeDefined();
      expect(refreshResult.data.refreshToken).not.toBe(originalRefreshToken);

      // Old refresh token should no longer work (session was rotated)
      await expect(
        service.refreshToken({ refreshToken: originalRefreshToken }),
      ).rejects.toThrow(HttpException);
    });
  });

  // --- Logout Flow ---

  describe('login → logout → verify session invalidated', () => {
    it('should invalidate session on logout', async () => {
      // Setup
      const registerResult = await service.register(testUser);
      const userId = registerResult.data.user.id;

      const loginResult = await service.login(
        { email: testUser.email, password: testUser.password },
        mockReq,
      );

      // Verify session exists
      let sessions = await prisma.session.findMany({ where: { userId } });
      expect(sessions).toHaveLength(1);

      // Logout
      const logoutResult = await service.logout({
        refreshToken: loginResult.data.refreshToken,
      });
      expect(logoutResult.message).toBe('Logged out successfully.');

      // Verify session was deleted
      sessions = await prisma.session.findMany({ where: { userId } });
      expect(sessions).toHaveLength(0);

      // Refresh should fail
      await expect(
        service.refreshToken({
          refreshToken: loginResult.data.refreshToken,
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  // --- Error Scenarios ---

  describe('error handling with real dependencies', () => {
    it('should reject duplicate email registration', async () => {
      await service.register(testUser);

      try {
        await service.register(testUser);
        fail('Expected HttpException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.CONFLICT);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('EMAIL_ALREADY_EXISTS');
      }
    });

    it('should reject login with wrong password', async () => {
      await service.register(testUser);

      try {
        await service.login(
          { email: testUser.email, password: 'wrongpassword' },
          mockReq,
        );
        fail('Expected HttpException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const response = httpError.getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should hash password correctly — not store plaintext', async () => {
      await service.register(testUser);

      const user = await prisma.user.findUnique({
        where: { email: testUser.email },
      });

      expect(user).toBeDefined();
      expect(user!.passwordHash).not.toBe(testUser.password);
      expect(user!.passwordHash.length).toBeGreaterThan(20); // bcrypt hashes are ~60 chars
    });
  });
});
