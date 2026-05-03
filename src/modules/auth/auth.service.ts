import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { RegisterInput } from './schemas/register.schema';
import { LoginInput } from './schemas/login.schema';
import { RefreshTokenInput } from './schemas/refresh-token.schema';
import { LogoutInput } from './schemas/logout.schema';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { Request } from 'express';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterInput) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new HttpException(
        {
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'An account with this email already exists.',
          },
        },
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
      },
    });

    return {
      message: 'Account created successfully.',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    };
  }

  async login(dto: LoginInput, req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, deletedAt: null },
    });

    if (!user) {
      throw new HttpException(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Account not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new HttpException(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload = {
      userId: user.id,
      name: user.name,
      email: user.email,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    const refreshExpiration =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
    const expiresAt = this.calculateExpiration(refreshExpiration);

    // Create session record
    await this.prisma.session.create({
      data: {
        userId: user.id,
        accessToken,
        refreshToken,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
        expiresAt,
      },
    });

    return {
      message: 'Login successful.',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
    };
  }

  async refreshToken(dto: RefreshTokenInput) {
    // Verify the refresh token signature
    let decoded: { userId: string; name: string; email: string };
    try {
      decoded = this.jwtService.verify<typeof decoded>(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new HttpException(
        {
          error: {
            code: 'REFRESH_TOKEN_EXPIRED',
            message: 'Refresh token has expired. Please log in again.',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Find the session matching this refresh token
    const session = await this.prisma.session.findFirst({
      where: { refreshToken: dto.refreshToken },
    });

    if (!session) {
      throw new HttpException(
        {
          error: {
            code: 'REFRESH_TOKEN_EXPIRED',
            message: 'Refresh token has expired. Please log in again.',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Check if the session has expired
    if (new Date() > session.expiresAt) {
      // Clean up expired session
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new HttpException(
        {
          error: {
            code: 'REFRESH_TOKEN_EXPIRED',
            message: 'Refresh token has expired. Please log in again.',
          },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Generate new tokens (rotation)
    const payload = {
      userId: decoded.userId,
      name: decoded.name,
      email: decoded.email,
    };

    const newAccessToken = this.generateAccessToken(payload);
    const newRefreshToken = this.generateRefreshToken(payload);

    const refreshExpiration =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
    const newExpiresAt = this.calculateExpiration(refreshExpiration);

    // Update the session with new tokens
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      },
    });

    return {
      message: 'Token refreshed successfully.',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    };
  }

  async logout(dto: LogoutInput) {
    const session = await this.prisma.session.findFirst({
      where: { refreshToken: dto.refreshToken },
    });

    if (session) {
      await this.prisma.session.delete({ where: { id: session.id } });
    }

    return {
      message: 'Logged out successfully.',
    };
  }

  async getProfile(user: RequestUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId, deletedAt: null },
    });

    if (!dbUser) {
      throw new HttpException(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found.',
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      message: 'User retrieved successfully.',
      data: {
        user: {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
        },
      },
    };
  }

  private generateAccessToken(payload: {
    userId: string;
    name: string;
    email: string;
  }): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_EXPIRATION') ||
        '15m') as JwtSignOptions['expiresIn'],
    });
  }

  private generateRefreshToken(payload: {
    userId: string;
    name: string;
    email: string;
  }): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRATION') ||
        '7d') as JwtSignOptions['expiresIn'],
    });
  }

  private calculateExpiration(duration: string): Date {
    const now = new Date();
    const match = /^(\d+)([smhd])$/.exec(duration);

    if (!match) {
      // Default to 7 days if unparseable
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(now.getTime() + value * multipliers[unit]);
  }
}
