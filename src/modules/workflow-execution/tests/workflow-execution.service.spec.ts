import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowExecutionService } from '../workflow-execution.service';
import { PrismaService } from '../../../database/prisma.service';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import type { DagDefinition, WorkflowRunJobData } from '../types';

describe('WorkflowExecutionService', () => {
  let service: WorkflowExecutionService;

  const mockPrisma = {
    workflowVersion: {
      findUnique: jest.fn(),
    },
    workflowRun: {
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    workflowRunStep: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockElasticsearch = {
    indexLog: jest.fn().mockResolvedValue(undefined),
  };

  const baseJobData: WorkflowRunJobData = {
    runId: 'run-1',
    organizationId: 'org-1',
    workflowId: 'wf-1',
    workflowVersionId: 'ver-1',
    triggerType: 'MANUAL',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ElasticsearchService, useValue: mockElasticsearch },
      ],
    }).compile();

    service = module.get<WorkflowExecutionService>(WorkflowExecutionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Helper to setup a version definition ---
  function setupDefinition(definition: DagDefinition) {
    mockPrisma.workflowVersion.findUnique.mockResolvedValue({
      id: 'ver-1',
      definition,
    });
    mockPrisma.workflowRun.update.mockResolvedValue({});
    mockPrisma.workflowRunStep.create.mockResolvedValue({});
    mockPrisma.workflowRunStep.updateMany.mockResolvedValue({});
    mockPrisma.workflowRun.findUniqueOrThrow.mockResolvedValue({
      id: 'run-1',
      startedAt: new Date(),
    });
    mockPrisma.workflowRun.findUnique.mockResolvedValue({
      id: 'run-1',
      startedAt: new Date(),
    });
  }

  // ──────────────────────────────────────────────
  // executeRun — Linear DAG
  // ──────────────────────────────────────────────

  describe('executeRun — linear DAG', () => {
    it('should execute a single-node DAG successfully', async () => {
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'delay-1',
            name: 'Short Delay',
            type: 'delay',
            config: { durationMs: 50 },
          },
        ],
        edges: [],
      };
      setupDefinition(definition);

      const onStepUpdate = jest.fn();
      await service.executeRun(baseJobData, onStepUpdate);

      // Should mark run as RUNNING then SUCCESS
      expect(mockPrisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );
      expect(mockPrisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'SUCCESS' }),
        }),
      );

      // Step update callback should be called
      expect(onStepUpdate).toHaveBeenCalledWith('delay-1', 'RUNNING');
      expect(onStepUpdate).toHaveBeenCalledWith(
        'delay-1',
        'SUCCESS',
        expect.anything(),
      );
    });

    it('should execute a multi-node linear DAG in order', async () => {
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'a',
            name: 'Step A',
            type: 'delay',
            config: { durationMs: 10 },
          },
          {
            id: 'b',
            name: 'Step B',
            type: 'delay',
            config: { durationMs: 10 },
          },
        ],
        edges: [{ from: 'a', to: 'b' }],
      };
      setupDefinition(definition);

      const callOrder: string[] = [];
      const onStepUpdate = jest.fn((nodeId: string, status: string) => {
        if (status === 'SUCCESS') callOrder.push(nodeId);
      });

      await service.executeRun(baseJobData, onStepUpdate);

      // A should complete before B
      expect(callOrder).toEqual(['a', 'b']);
    });
  });

  // ──────────────────────────────────────────────
  // executeRun — Empty definition
  // ──────────────────────────────────────────────

  describe('executeRun — edge cases', () => {
    it('should fail run if definition has no nodes', async () => {
      setupDefinition({ nodes: [], edges: [] });

      await service.executeRun(baseJobData);

      expect(mockPrisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'Workflow has no nodes to execute.',
          }),
        }),
      );
    });

    it('should handle null definition gracefully', async () => {
      mockPrisma.workflowVersion.findUnique.mockResolvedValue({
        id: 'ver-1',
        definition: null,
      });

      await service.executeRun(baseJobData);

      expect(mockPrisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: 'FAILED',
          }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // executeRun — Conditional branching
  // ──────────────────────────────────────────────

  describe('executeRun — conditional branching', () => {
    it('should skip false branch when condition is true', async () => {
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'cond',
            name: 'Check',
            type: 'conditional',
            config: {
              expression: '1 === 1',
              trueLabel: 'Yes',
              falseLabel: 'No',
            },
          },
          {
            id: 'true-path',
            name: 'True Path',
            type: 'delay',
            config: { durationMs: 10 },
          },
          {
            id: 'false-path',
            name: 'False Path',
            type: 'delay',
            config: { durationMs: 10 },
          },
        ],
        edges: [
          { from: 'cond', to: 'true-path', condition: 'true' },
          { from: 'cond', to: 'false-path', condition: 'false' },
        ],
      };
      setupDefinition(definition);

      const statusUpdates: Record<string, string[]> = {};
      const onStepUpdate = jest.fn((nodeId: string, status: string) => {
        statusUpdates[nodeId] = statusUpdates[nodeId] || [];
        statusUpdates[nodeId].push(status);
      });

      await service.executeRun(baseJobData, onStepUpdate);

      // true-path should run, false-path should be skipped
      expect(statusUpdates['true-path']).toContain('SUCCESS');
      expect(statusUpdates['false-path']).toContain('SKIPPED');
    });

    it('should skip true branch when condition is false', async () => {
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'cond',
            name: 'Check',
            type: 'conditional',
            config: {
              expression: '1 === 2',
              trueLabel: 'Yes',
              falseLabel: 'No',
            },
          },
          {
            id: 'true-path',
            name: 'True Path',
            type: 'delay',
            config: { durationMs: 10 },
          },
          {
            id: 'false-path',
            name: 'False Path',
            type: 'delay',
            config: { durationMs: 10 },
          },
        ],
        edges: [
          { from: 'cond', to: 'true-path', condition: 'true' },
          { from: 'cond', to: 'false-path', condition: 'false' },
        ],
      };
      setupDefinition(definition);

      const statusUpdates: Record<string, string[]> = {};
      const onStepUpdate = jest.fn((nodeId: string, status: string) => {
        statusUpdates[nodeId] = statusUpdates[nodeId] || [];
        statusUpdates[nodeId].push(status);
      });

      await service.executeRun(baseJobData, onStepUpdate);

      expect(statusUpdates['false-path']).toContain('SUCCESS');
      expect(statusUpdates['true-path']).toContain('SKIPPED');
    });
  });

  // ──────────────────────────────────────────────
  // executeRun — Error handling strategy: skip
  // ──────────────────────────────────────────────

  describe('executeRun — error strategies', () => {
    it('should skip failed node when onError=skip and continue workflow', async () => {
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'fail-node',
            name: 'Fail Node',
            type: 'script_execution',
            config: {
              language: 'javascript',
              script: 'throw new Error("boom");',
              timeoutMs: 1000,
              __settings: {
                enabled: true,
                onError: 'skip',
                maxRetries: 0,
                backoffStrategy: 'fixed',
                backoffDelayMs: 100,
                timeoutOverrideMs: 0,
              },
            },
          },
          {
            id: 'next-node',
            name: 'Next',
            type: 'delay',
            config: { durationMs: 10 },
          },
        ],
        edges: [{ from: 'fail-node', to: 'next-node' }],
      };
      setupDefinition(definition);

      const statusUpdates: Record<string, string[]> = {};
      const onStepUpdate = jest.fn((nodeId: string, status: string) => {
        statusUpdates[nodeId] = statusUpdates[nodeId] || [];
        statusUpdates[nodeId].push(status);
      });

      await service.executeRun(baseJobData, onStepUpdate);

      // fail-node should be marked SKIPPED (skip strategy), next-node should succeed
      expect(statusUpdates['fail-node']).toContain('SKIPPED');
      expect(statusUpdates['next-node']).toContain('SUCCESS');
    });

    it('should fail entire workflow when onError=fail', async () => {
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'fail-node',
            name: 'Fail',
            type: 'script_execution',
            config: {
              language: 'javascript',
              script: 'throw new Error("boom");',
              timeoutMs: 1000,
              __settings: {
                enabled: true,
                onError: 'fail',
                maxRetries: 0,
                backoffStrategy: 'fixed',
                backoffDelayMs: 100,
                timeoutOverrideMs: 0,
              },
            },
          },
          {
            id: 'next-node',
            name: 'Next',
            type: 'delay',
            config: { durationMs: 10 },
          },
        ],
        edges: [{ from: 'fail-node', to: 'next-node' }],
      };
      setupDefinition(definition);

      const statusUpdates: Record<string, string[]> = {};
      const onStepUpdate = jest.fn((nodeId: string, status: string) => {
        statusUpdates[nodeId] = statusUpdates[nodeId] || [];
        statusUpdates[nodeId].push(status);
      });

      await service.executeRun(baseJobData, onStepUpdate);

      expect(statusUpdates['fail-node']).toContain('FAILED');
      expect(statusUpdates['next-node']).toContain('FAILED'); // cascaded failure
      // Run should be FAILED
      expect(mockPrisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // executeRun — Retry logic
  // ──────────────────────────────────────────────

  describe('executeRun — retry logic', () => {
    it('should retry a failing node according to settings', async () => {
      // We spy on executeNodeByType to track calls
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'retry-node',
            name: 'Retry Me',
            type: 'script_execution',
            config: {
              language: 'javascript',
              script: 'throw new Error("always fails");',
              timeoutMs: 1000,
              __settings: {
                enabled: true,
                onError: 'retry',
                maxRetries: 2,
                backoffStrategy: 'fixed',
                backoffDelayMs: 10,
                timeoutOverrideMs: 0,
              },
            },
          },
        ],
        edges: [],
      };
      setupDefinition(definition);

      const executeNodeSpy = jest.spyOn(service, 'executeNodeByType');

      await service.executeRun(baseJobData);

      // Should have been called 3 times: 1 initial + 2 retries
      const retryCalls = executeNodeSpy.mock.calls.filter(
        (c) => c[0] === 'script_execution',
      );
      expect(retryCalls.length).toBe(3);

      executeNodeSpy.mockRestore();
    });
  });

  // ──────────────────────────────────────────────
  // executeRun — set_variable context propagation
  // ──────────────────────────────────────────────

  describe('executeRun — set_variable', () => {
    it('should propagate variables between nodes', async () => {
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'set-var',
            name: 'Set Variable',
            type: 'set_variable',
            config: {
              variableName: 'greeting',
              expression: '"hello world"',
            },
          },
          {
            id: 'use-var',
            name: 'Use Variable',
            type: 'conditional',
            config: {
              expression: '@{{greeting}} === "hello world"',
            },
          },
        ],
        edges: [{ from: 'set-var', to: 'use-var' }],
      };
      setupDefinition(definition);

      const statusUpdates: Record<string, string[]> = {};
      const outputCapture: Record<string, unknown> = {};
      const onStepUpdate = jest.fn(
        (nodeId: string, status: string, output?: unknown) => {
          statusUpdates[nodeId] = statusUpdates[nodeId] || [];
          statusUpdates[nodeId].push(status);
          if (output) outputCapture[nodeId] = output;
        },
      );

      await service.executeRun(baseJobData, onStepUpdate);

      expect(statusUpdates['set-var']).toContain('SUCCESS');
      expect(statusUpdates['use-var']).toContain('SUCCESS');

      // The conditional should evaluate to true because variable was set
      const condOutput = outputCapture['use-var'] as {
        conditionMet: boolean;
      };
      expect(condOutput?.conditionMet).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // cancelRun
  // ──────────────────────────────────────────────

  describe('cancelRun', () => {
    it('should return false when run is not executing', () => {
      expect(service.cancelRun('non-existent')).toBe(false);
    });

    it('should abort a running workflow', async () => {
      // Use a moderate delay so we have time to cancel between layers
      const definition: DagDefinition = {
        nodes: [
          {
            id: 'slow-1',
            name: 'Slow Node 1',
            type: 'delay',
            config: { durationMs: 200 },
          },
          {
            id: 'slow-2',
            name: 'Slow Node 2',
            type: 'delay',
            config: { durationMs: 200 },
          },
        ],
        edges: [{ from: 'slow-1', to: 'slow-2' }],
      };
      setupDefinition(definition);

      // Start the run asynchronously
      const runPromise = service.executeRun(baseJobData);

      // Wait for the first layer to complete (200ms + buffer)
      await new Promise((r) => setTimeout(r, 300));

      const cancelled = service.cancelRun('run-1');
      expect(cancelled).toBe(true);

      await runPromise;

      // Run should be marked CANCELLED
      expect(mockPrisma.workflowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    }, 10000);
  });

  // ──────────────────────────────────────────────
  // executeNodeByType
  // ──────────────────────────────────────────────

  describe('executeNodeByType', () => {
    it('should return FAILED for unknown node types', async () => {
      const result = await service.executeNodeByType('unknown_type', {});
      expect(result.status).toBe('FAILED');
      expect((result.output as { message: string }).message).toContain(
        'Unknown node type',
      );
    });

    it('should route to delay executor', async () => {
      const result = await service.executeNodeByType('delay', {
        durationMs: 10,
      });
      expect(result.status).toBe('SUCCESS');
    });

    it('should route to conditional executor', async () => {
      const result = await service.executeNodeByType('conditional', {
        expression: '1 === 1',
      });
      expect(result.status).toBe('SUCCESS');
    });
  });
});
