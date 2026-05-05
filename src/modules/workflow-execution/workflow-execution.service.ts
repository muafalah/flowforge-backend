import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import type { ExecutionLogEntry } from '../elasticsearch/elasticsearch.service';
import {
  executeHttpCall,
  executeScript,
  executeDelay,
  executeConditional,
  executeSetVariable,
} from './node-executors';
import type {
  DagDefinition,
  DagNode,
  ExecutionContext,
  NodeRunResult,
  NodeSettings,
  WorkflowRunJobData,
} from './types';
import { topologicalSort } from '../workflow/utils/dag-validator';

@Injectable()
export class WorkflowExecutionService {
  private readonly logger = new Logger(WorkflowExecutionService.name);
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  /**
   * Execute a complete workflow run.
   * Updates DB records and emits logs to Elasticsearch in real-time.
   */
  async executeRun(
    jobData: WorkflowRunJobData,
    onStepUpdate?: (nodeId: string, status: string, output?: unknown) => void,
  ): Promise<void> {
    const { runId, workflowVersionId, organizationId } = jobData;
    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    try {
      // 1. Load version definition
      const version = await this.prisma.workflowVersion.findUniqueOrThrow({
        where: { id: workflowVersionId },
      });
      const definition = version.definition as unknown as DagDefinition;

      if (!definition?.nodes?.length) {
        await this.failRun(runId, 'Workflow has no nodes to execute.');
        return;
      }

      // 2. Mark run as RUNNING
      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: { status: 'RUNNING', startedAt: new Date() },
      });

      // 3. Create step records for all nodes
      const executionOrder = topologicalSort(
        definition.nodes,
        definition.edges,
      );
      const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));
      const adjacency: Record<string, string[]> = {};
      definition.nodes.forEach((n) => (adjacency[n.id] = []));
      definition.edges.forEach((e) => {
        adjacency[e.from] = [...(adjacency[e.from] ?? []), e.to];
      });

      for (let i = 0; i < executionOrder.length; i++) {
        const nodeId = executionOrder[i];
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        await this.prisma.workflowRunStep.create({
          data: {
            workflowRunId: runId,
            nodeId: node.id,
            name: node.name,
            description: node.description,
            type: node.type,
            status: 'PENDING',
            executionOrder: i,
          },
        });
      }

      // 4. Build topological layers for parallel execution
      const layers = this.buildLayers(definition);

      // 5. Execute layer by layer
      const context: ExecutionContext = { variables: {}, inputs: [] };
      const nodeResults = new Map<
        string,
        { status: string; output: unknown }
      >();
      const skippedByBranch = new Set<string>();
      let hasFailure = false;

      for (const layer of layers) {
        if (abortController.signal.aborted) break;
        if (hasFailure) {
          // Mark remaining as FAILED
          for (const nodeId of layer) {
            await this.updateStep(
              runId,
              nodeId,
              'FAILED',
              null,
              'Previous node failed',
              0,
              0,
            );
            this.emitLog(
              organizationId,
              runId,
              nodeId,
              nodeMap.get(nodeId)!,
              'WARN',
              'Skipped: previous node failed',
            );
            onStepUpdate?.(nodeId, 'FAILED');
          }
          continue;
        }

        // Filter skipped nodes
        const activeLayer = layer.filter((nodeId) => {
          if (skippedByBranch.has(nodeId)) {
            void this.updateStep(
              runId,
              nodeId,
              'SKIPPED',
              null,
              'Conditional branch not taken',
              0,
              0,
            );
            this.emitLog(
              organizationId,
              runId,
              nodeId,
              nodeMap.get(nodeId)!,
              'WARN',
              'Skipped: conditional branch not taken',
            );
            onStepUpdate?.(nodeId, 'SKIPPED');
            nodeResults.set(nodeId, { status: 'SKIPPED', output: null });
            return false;
          }
          return true;
        });

        if (activeLayer.length === 0) continue;

        // Mark layer as RUNNING
        for (const nodeId of activeLayer) {
          await this.prisma.workflowRunStep.updateMany({
            where: { workflowRunId: runId, nodeId },
            data: { status: 'RUNNING', startedAt: new Date() },
          });
          onStepUpdate?.(nodeId, 'RUNNING');
        }

        // Execute all nodes in layer concurrently
        const layerResults = await Promise.all(
          activeLayer.map(async (nodeId) => {
            const node = nodeMap.get(nodeId)!;
            const config = { ...(node.config ?? {}) };
            const settings = config.__settings as NodeSettings | undefined;
            if (settings) delete config.__settings;

            // Gather inputs from predecessors
            const incomingEdges = definition.edges.filter(
              (e) => e.to === nodeId,
            );
            const inputs = incomingEdges.map(
              (e) => nodeResults.get(e.from)?.output,
            );
            const execContext: ExecutionContext = {
              variables: context.variables,
              inputs,
            };

            // Apply timeout override
            if (settings?.enabled && settings.timeoutOverrideMs > 0) {
              config.timeoutMs = settings.timeoutOverrideMs;
            }

            // Execute with retry logic
            let result = await this.executeNodeByType(
              node.type,
              config,
              execContext,
            );
            let retryCount = 0;

            if (
              result.status === 'FAILED' &&
              settings?.enabled &&
              settings.onError === 'retry'
            ) {
              while (
                retryCount < settings.maxRetries &&
                result.status === 'FAILED'
              ) {
                if (abortController.signal.aborted) break;
                retryCount++;
                const delay = this.computeBackoffDelay(settings, retryCount);
                this.emitLog(
                  organizationId,
                  runId,
                  nodeId,
                  node,
                  'INFO',
                  `Retry attempt ${retryCount} after ${delay}ms...`,
                );
                await this.sleep(delay);
                result = await this.executeNodeByType(
                  node.type,
                  config,
                  execContext,
                );
              }
            }

            // Determine final status
            let finalStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED' = result.status;
            if (result.status === 'FAILED' && settings?.enabled) {
              if (settings.onError === 'skip') {
                finalStatus = 'SKIPPED';
                this.emitLog(
                  organizationId,
                  runId,
                  nodeId,
                  node,
                  'WARN',
                  'Node failed but error strategy is SKIP — continuing workflow.',
                );
              }
            }

            // Handle set_variable
            if (node.type === 'set_variable' && result.status === 'SUCCESS') {
              const out = result.output as {
                variableName: string;
                value: unknown;
              };
              context.variables[out.variableName] = out.value;
            }

            // Handle conditional branching
            if (node.type === 'conditional' && finalStatus === 'SUCCESS') {
              const condOutput = result.output as {
                conditionMet: boolean;
              };
              const inactiveBranch = condOutput.conditionMet ? 'false' : 'true';
              const outEdges = definition.edges.filter(
                (e) => e.from === nodeId,
              );
              const inactiveTargets: string[] = [];
              const activeTargets: string[] = [];

              for (const e of outEdges) {
                if (e.condition === inactiveBranch) {
                  inactiveTargets.push(e.to);
                } else {
                  activeTargets.push(e.to);
                }
              }

              if (inactiveTargets.length > 0) {
                const inactiveReachable = this.collectReachable(
                  inactiveTargets,
                  adjacency,
                );
                const activeReachable = this.collectReachable(
                  activeTargets,
                  adjacency,
                );
                for (const nId of inactiveReachable) {
                  if (!activeReachable.has(nId)) skippedByBranch.add(nId);
                }
              }
            }

            // Log all result logs to ES
            for (const log of result.logs) {
              this.emitLog(
                organizationId,
                runId,
                nodeId,
                node,
                log.level.toUpperCase() as 'INFO' | 'WARN' | 'ERROR',
                log.message,
              );
            }

            return {
              nodeId,
              status: finalStatus,
              output: result.output,
              durationMs: result.durationMs,
              retryCount,
              error:
                finalStatus === 'FAILED'
                  ? (result.output as { message?: string })?.message
                  : undefined,
            };
          }),
        );

        // Process results
        for (const result of layerResults) {
          nodeResults.set(result.nodeId, {
            status: result.status,
            output: result.output,
          });

          await this.updateStep(
            runId,
            result.nodeId,
            result.status,
            result.output,
            result.error ?? null,
            result.retryCount,
            result.durationMs,
          );
          onStepUpdate?.(result.nodeId, result.status, result.output);

          if (result.status === 'FAILED') hasFailure = true;
        }
      }

      // 6. Finalize run
      const finalStatus = abortController.signal.aborted
        ? 'CANCELLED'
        : hasFailure
          ? 'FAILED'
          : 'SUCCESS';

      const run = await this.prisma.workflowRun.findUniqueOrThrow({
        where: { id: runId },
      });
      const durationMs = run.startedAt
        ? Date.now() - run.startedAt.getTime()
        : 0;

      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          finishedAt: new Date(),
          durationMs,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Run ${runId} failed: ${errorMessage}`);
      try {
        await this.failRun(runId, errorMessage);
      } catch {
        // Ignore if run was deleted during test cleanup
      }
    } finally {
      this.abortControllers.delete(runId);
    }
  }

  /** Cancel a running workflow */
  cancelRun(runId: string): boolean {
    const controller = this.abortControllers.get(runId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /** Dispatch to the correct node executor based on type */
  async executeNodeByType(
    nodeType: string,
    config: Record<string, unknown>,
    context: ExecutionContext = { variables: {}, inputs: [] },
  ): Promise<NodeRunResult> {
    switch (nodeType) {
      case 'http_call':
        return executeHttpCall(config, context);
      case 'script_execution':
        return executeScript(config, context);
      case 'delay':
        return executeDelay(config);
      case 'conditional':
        return executeConditional(config, context);
      case 'set_variable':
        return executeSetVariable(config, context);
      default:
        return {
          status: 'FAILED',
          durationMs: 0,
          startedAt: new Date().toISOString(),
          output: { error: true, message: `Unknown node type: ${nodeType}` },
          logs: [
            {
              timestamp: new Date().toISOString(),
              level: 'error',
              message: `Unknown node type: ${nodeType}`,
            },
          ],
        };
    }
  }

  // ----------- Private helpers -----------

  private buildLayers(definition: DagDefinition): string[][] {
    const inDegree: Record<string, number> = {};
    const adjacency: Record<string, string[]> = {};

    definition.nodes.forEach((n) => {
      inDegree[n.id] = 0;
      adjacency[n.id] = [];
    });
    definition.edges.forEach((e) => {
      inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
      adjacency[e.from] = [...(adjacency[e.from] ?? []), e.to];
    });

    const queue = definition.nodes
      .filter((n) => (inDegree[n.id] ?? 0) === 0)
      .map((n) => n.id);
    const layers: string[][] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const layer = [...queue];
      layers.push(layer);
      queue.length = 0;
      for (const nodeId of layer) {
        visited.add(nodeId);
        for (const neighbor of adjacency[nodeId] ?? []) {
          inDegree[neighbor]--;
          if (inDegree[neighbor] === 0 && !visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    // Orphan nodes
    const orphans = definition.nodes
      .filter((n) => !visited.has(n.id))
      .map((n) => n.id);
    if (orphans.length > 0) layers.push(orphans);

    return layers;
  }

  private collectReachable(
    startIds: string[],
    adjacency: Record<string, string[]>,
  ): Set<string> {
    const reachable = new Set<string>();
    const q = [...startIds];
    while (q.length > 0) {
      const id = q.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const neighbor of adjacency[id] ?? []) q.push(neighbor);
    }
    return reachable;
  }

  private computeBackoffDelay(settings: NodeSettings, attempt: number): number {
    const base = settings.backoffDelayMs;
    switch (settings.backoffStrategy) {
      case 'linear':
        return base * attempt;
      case 'exponential':
        return base * Math.pow(2, attempt - 1);
      case 'fixed':
      default:
        return base;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async updateStep(
    runId: string,
    nodeId: string,
    status: string,
    output: unknown,
    error: string | null,
    retryCount: number,
    durationMs: number,
  ): Promise<void> {
    await this.prisma.workflowRunStep.updateMany({
      where: { workflowRunId: runId, nodeId },
      data: {
        status: status as 'SUCCESS' | 'FAILED' | 'SKIPPED',
        output: output !== undefined ? (output as object) : undefined,
        error,
        retryCount,
        durationMs,
        finishedAt: new Date(),
      },
    });
  }

  private async failRun(runId: string, errorMessage: string): Promise<void> {
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage,
        finishedAt: new Date(),
      },
    });
  }

  private emitLog(
    organizationId: string,
    runId: string,
    nodeId: string,
    node: DagNode,
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
  ): void {
    const logEntry: ExecutionLogEntry = {
      logId: randomUUID(),
      organizationId,
      runId,
      nodeId,
      nodeName: node.name,
      nodeType: node.type,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    // Fire-and-forget — don't block execution on log indexing
    void this.elasticsearchService.indexLog(logEntry);
  }
}
