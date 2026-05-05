import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  HttpStatus,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { AiWorkflowController } from '../ai-workflow.controller';
import { AiWorkflowService } from '../ai-workflow.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

// Mock AiWorkflowService
const mockGenerateWorkflow = jest.fn();

// Simple mock guard that always passes and sets request.user
const mockPassGuard = {
  canActivate: (context: {
    switchToHttp: () => { getRequest: () => Record<string, unknown> };
  }) => {
    const req = context.switchToHttp().getRequest();
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    return true;
  },
};

describe('AiWorkflowController (Integration)', () => {
  let app: INestApplication;

  const validDefinition = {
    nodes: [
      {
        id: 'node-1',
        name: 'Fetch Data',
        type: 'http_call',
        config: { url: 'https://api.example.com', method: 'GET' },
      },
    ],
    edges: [],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiWorkflowController],
      providers: [
        {
          provide: AiWorkflowService,
          useValue: { generateWorkflow: mockGenerateWorkflow },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        // PrismaService is needed by OrganizationGuardWithParam mixin
        {
          provide: PrismaService,
          useValue: {
            organization: {
              findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }),
            },
            organizationMember: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'member-1',
                organizationId: 'org-1',
                userId: 'user-1',
                role: 'OWNER',
              }),
            },
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockPassGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const orgId = '550e8400-e29b-41d4-a716-446655440000';

  describe('POST /organizations/:organizationId/ai/generate-workflow', () => {
    it('should return 200 with a valid DagDefinition', async () => {
      mockGenerateWorkflow.mockResolvedValue(validDefinition);

      const response = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/ai/generate-workflow`)
        .send({ prompt: 'Fetch data from API and process it' })
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        message: 'Workflow generated successfully.',
        data: { definition: validDefinition },
      });
      expect(mockGenerateWorkflow).toHaveBeenCalledWith(
        'Fetch data from API and process it',
      );
    });

    it('should return 400 when prompt is too short', async () => {
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/ai/generate-workflow`)
        .send({ prompt: 'Hi' })
        .expect(HttpStatus.BAD_REQUEST);

      expect(mockGenerateWorkflow).not.toHaveBeenCalled();
    });

    it('should return 400 when prompt is missing', async () => {
      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/ai/generate-workflow`)
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      expect(mockGenerateWorkflow).not.toHaveBeenCalled();
    });

    it('should return 400 when prompt exceeds max length', async () => {
      const longPrompt = 'a'.repeat(1001);

      await request(app.getHttpServer())
        .post(`/organizations/${orgId}/ai/generate-workflow`)
        .send({ prompt: longPrompt })
        .expect(HttpStatus.BAD_REQUEST);

      expect(mockGenerateWorkflow).not.toHaveBeenCalled();
    });

    it('should forward service errors to the client', async () => {
      mockGenerateWorkflow.mockRejectedValue(
        new HttpException(
          {
            error: {
              code: 'GENERATION_FAILED',
              message: 'AI could not generate a valid workflow.',
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        ),
      );

      const response = await request(app.getHttpServer())
        .post(`/organizations/${orgId}/ai/generate-workflow`)
        .send({ prompt: 'Create a complex workflow' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const responseBody = response.body as { error: { code: string } };
      expect(responseBody.error.code).toBe('GENERATION_FAILED');
    });
  });
});
