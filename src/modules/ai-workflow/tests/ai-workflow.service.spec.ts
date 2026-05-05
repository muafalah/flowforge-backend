import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AiWorkflowService } from '../ai-workflow.service';

// Mock OpenAI
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('AiWorkflowService', () => {
  let service: AiWorkflowService;

  const validDefinition = {
    nodes: [
      {
        id: 'node-1',
        name: 'Fetch Users',
        type: 'http_call',
        config: {
          url: 'https://api.example.com/users',
          method: 'GET',
          headers: '{}',
          body: '',
          timeoutMs: 30000,
        },
      },
      {
        id: 'node-2',
        name: 'Log Count',
        type: 'script_execution',
        config: {
          language: 'javascript',
          script: 'console.log("done")',
          timeoutMs: 60000,
        },
      },
    ],
    edges: [{ from: 'node-1', to: 'node-2' }],
  };

  /** Helper to build a mock OpenAI completion response */
  const mockCompletion = (content: string) => ({
    choices: [{ message: { content } }],
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiWorkflowService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get<AiWorkflowService>(AiWorkflowService);
  });

  describe('generateWorkflow', () => {
    it('should generate a valid workflow from a prompt', async () => {
      mockCreate.mockResolvedValue(
        mockCompletion(JSON.stringify(validDefinition)),
      );

      const result = await service.generateWorkflow(
        'Fetch users from API and log the count',
      );

      expect(result).toBeDefined();
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.nodes[0].id).toBe('node-1');
      expect(result.nodes[0].type).toBe('http_call');
      expect(result.nodes[1].type).toBe('script_execution');
      expect(result.edges[0]).toEqual({ from: 'node-1', to: 'node-2' });
    });

    it('should retry once when first attempt produces invalid output', async () => {
      const invalidDefinition = {
        nodes: [
          { id: 'node-1', name: 'A', type: 'http_call' },
          { id: 'node-1', name: 'B', type: 'delay' }, // duplicate ID
        ],
        edges: [],
      };

      mockCreate
        .mockResolvedValueOnce(
          mockCompletion(JSON.stringify(invalidDefinition)),
        )
        .mockResolvedValueOnce(mockCompletion(JSON.stringify(validDefinition)));

      const result = await service.generateWorkflow('Some workflow');

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    it('should throw UNPROCESSABLE_ENTITY when both attempts fail validation', async () => {
      const invalidDefinition = {
        nodes: [
          { id: 'node-1', name: 'A', type: 'http_call' },
          { id: 'node-1', name: 'B', type: 'delay' }, // duplicate ID
        ],
        edges: [],
      };

      mockCreate.mockResolvedValue(
        mockCompletion(JSON.stringify(invalidDefinition)),
      );

      await expect(service.generateWorkflow('Some workflow')).rejects.toThrow(
        HttpException,
      );

      try {
        await service.generateWorkflow('Some workflow');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    });

    it('should throw BAD_REQUEST when AI detects an off-topic prompt', async () => {
      mockCreate.mockResolvedValue(
        mockCompletion(
          JSON.stringify({
            error: 'INVALID_REQUEST',
            message:
              "I can only generate workflow definitions. Please describe a workflow automation you'd like to create.",
          }),
        ),
      );

      await expect(
        service.generateWorkflow('How old are you?'),
      ).rejects.toThrow(HttpException);

      try {
        await service.generateWorkflow('How old are you?');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
        const response = (error as HttpException).getResponse() as Record<
          string,
          unknown
        >;
        expect((response.error as Record<string, unknown>).code).toBe(
          'INVALID_PROMPT',
        );
      }
    });

    it('should throw BAD_GATEWAY when OpenAI API call fails', async () => {
      mockCreate.mockRejectedValue(new Error('Network timeout'));

      await expect(
        service.generateWorkflow('Create a workflow'),
      ).rejects.toThrow(HttpException);

      try {
        await service.generateWorkflow('Create a workflow');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_GATEWAY,
        );
      }
    });

    it('should throw UNPROCESSABLE_ENTITY when AI returns non-JSON', async () => {
      mockCreate.mockResolvedValue(mockCompletion('This is not JSON at all'));

      await expect(
        service.generateWorkflow('Create a workflow'),
      ).rejects.toThrow(HttpException);

      try {
        await service.generateWorkflow('Create a workflow');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    });

    it('should throw UNPROCESSABLE_ENTITY when response has no nodes/edges', async () => {
      mockCreate
        .mockResolvedValueOnce(mockCompletion(JSON.stringify({ foo: 'bar' })))
        .mockResolvedValueOnce(mockCompletion(JSON.stringify({ foo: 'bar' })));

      await expect(
        service.generateWorkflow('Create a workflow'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('when GROQ_API_KEY is not configured', () => {
    it('should throw SERVICE_UNAVAILABLE', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiWorkflowService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();

      const unconfiguredService =
        module.get<AiWorkflowService>(AiWorkflowService);

      await expect(
        unconfiguredService.generateWorkflow('Create a workflow'),
      ).rejects.toThrow(HttpException);

      try {
        await unconfiguredService.generateWorkflow('Create a workflow');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    });
  });
});
