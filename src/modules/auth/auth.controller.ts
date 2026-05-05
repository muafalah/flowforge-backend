import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { registerSchema } from './schemas/register.schema';
import { loginSchema } from './schemas/login.schema';
import { refreshTokenSchema } from './schemas/refresh-token.schema';
import { logoutSchema } from './schemas/logout.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully.',
    schema: {
      example: {
        message: 'Account created successfully.',
        data: {
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists.',
    schema: {
      example: {
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error.',
    schema: {
      example: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data.',
          fields: {
            email: 'Email format is invalid.',
            password: 'Password must be at least 8 characters long.',
          },
        },
      },
    },
  })
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful.',
    schema: {
      example: {
        message: 'Login successful.',
        data: {
          accessToken: 'jwt_access_token',
          refreshToken: 'jwt_refresh_token',
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Account not found.',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials.',
    schema: {
      example: {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      },
    },
  })
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully.',
    schema: {
      example: {
        message: 'Token refreshed successfully.',
        data: {
          accessToken: 'new_jwt_access_token',
          refreshToken: 'new_refresh_token',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token expired or invalid.',
    schema: {
      example: {
        error: {
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token has expired. Please log in again.',
        },
      },
    },
  })
  @UsePipes(new ZodValidationPipe(refreshTokenSchema))
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and invalidate refresh token' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully.',
    schema: {
      example: {
        message: 'Logged out successfully.',
      },
    },
  })
  @UsePipes(new ZodValidationPipe(logoutSchema))
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully.',
    schema: {
      example: {
        message: 'User retrieved successfully.',
        data: {
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'John Doe',
            email: 'john@email.com',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token.',
    schema: {
      example: {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
        },
      },
    },
  })
  getProfile(@CurrentUser() user: RequestUser) {
    return this.authService.getProfile(user);
  }
}
