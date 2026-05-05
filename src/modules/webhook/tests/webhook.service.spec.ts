import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from '../webhook.service';
import { PrismaService } from '../../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { WorkflowRunService } from '../../workflow-run/workflow-run.service';
import { HttpException } from '@nestjs/common';

describe('WebhookService', () => {
  let service: WebhookService;

  const mockPrisma = {
    workflow: { findFirst: jest.fn() },
    webhookTrigger: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  const mockRunService = {
    triggerRun: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: WorkflowRunService, useValue: mockRunService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create a webhook with auto-generated secret and URL', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue({ id: 'wf-1' });
      mockPrisma.webhookTrigger.create.mockResolvedValue({
        id: 'wh-1',
        organizationId: 'org-1',
        workflowId: 'wf-1',
        name: 'Test Hook',
        description: null,
        secret: 'abc123',
        urlPath: 'test-path',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create('org-1', 'wf-1', 'user-1', {
        name: 'Test Hook',
      });

      expect(result.message).toBe('Webhook created successfully.');
      expect(result.data.webhook.webhookUrl).toContain('/v1/webhooks/');
      expect(result.data.webhook.secret).toBeTruthy();
    });

    it('should throw if workflow not found', async () => {
      mockPrisma.workflow.findFirst.mockResolvedValue(null);

      await expect(
        service.create('org-1', 'invalid', 'user-1', { name: 'Test' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('handleIncomingWebhook', () => {
    it('should trigger a run for valid webhook', async () => {
      mockPrisma.webhookTrigger.findUnique.mockResolvedValue({
        id: 'wh-1',
        secret: 'valid-secret',
        isActive: true,
        workflow: {
          id: 'wf-1',
          organizationId: 'org-1',
          activeVersionId: 'v-1',
          deletedAt: null,
        },
      });
      mockRunService.triggerRun.mockResolvedValue({ id: 'run-1' });

      const result = await service.handleIncomingWebhook(
        'test-path',
        'valid-secret',
      );

      expect(result.message).toBe('Webhook received. Run triggered.');
      expect(result.runId).toBe('run-1');
    });

    it('should reject invalid secret', async () => {
      mockPrisma.webhookTrigger.findUnique.mockResolvedValue({
        id: 'wh-1',
        secret: 'valid-secret',
        isActive: true,
        workflow: {
          id: 'wf-1',
          organizationId: 'org-1',
          activeVersionId: 'v-1',
          deletedAt: null,
        },
      });

      await expect(
        service.handleIncomingWebhook('test-path', 'wrong-secret'),
      ).rejects.toThrow(HttpException);
    });

    it('should reject inactive webhook', async () => {
      mockPrisma.webhookTrigger.findUnique.mockResolvedValue({
        id: 'wh-1',
        secret: 'valid-secret',
        isActive: false,
        workflow: {
          id: 'wf-1',
          organizationId: 'org-1',
          activeVersionId: 'v-1',
          deletedAt: null,
        },
      });

      await expect(
        service.handleIncomingWebhook('test-path', 'valid-secret'),
      ).rejects.toThrow(HttpException);
    });

    it('should reject if webhook not found', async () => {
      mockPrisma.webhookTrigger.findUnique.mockResolvedValue(null);

      await expect(
        service.handleIncomingWebhook('invalid', 'secret'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('should regenerate secret when requested', async () => {
      mockPrisma.webhookTrigger.findFirst.mockResolvedValue({ id: 'wh-1' });
      mockPrisma.webhookTrigger.update.mockResolvedValue({
        id: 'wh-1',
        organizationId: 'org-1',
        workflowId: 'wf-1',
        name: 'Test',
        description: null,
        secret: 'new-secret',
        urlPath: 'path',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.update('org-1', 'wf-1', 'wh-1', {
        regenerateSecret: true,
      });

      expect(result.message).toBe('Webhook updated successfully.');
    });
  });

  describe('remove', () => {
    it('should delete a webhook', async () => {
      mockPrisma.webhookTrigger.findFirst.mockResolvedValue({ id: 'wh-1' });
      mockPrisma.webhookTrigger.delete.mockResolvedValue({});

      const result = await service.remove('org-1', 'wf-1', 'wh-1');
      expect(result.message).toBe('Webhook deleted successfully.');
    });
  });
});
