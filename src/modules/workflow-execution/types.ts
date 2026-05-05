/** Shared types for workflow execution */

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface NodeRunResult {
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  startedAt: string;
  output: unknown;
  logs: LogEntry[];
}

export interface ExecutionContext {
  variables: Record<string, unknown>;
  inputs: unknown[];
}

export interface WorkflowRunJobData {
  runId: string;
  organizationId: string;
  workflowId: string;
  workflowVersionId: string;
  triggeredBy?: string;
  triggerType: 'MANUAL' | 'CRON' | 'WEBHOOK';
}

export interface NodeSettings {
  onError: 'fail' | 'skip' | 'retry';
  maxRetries: number;
  backoffStrategy: 'fixed' | 'linear' | 'exponential';
  backoffDelayMs: number;
  timeoutOverrideMs: number;
  enabled: boolean;
}

export interface DagNode {
  id: string;
  name: string;
  description?: string;
  type: string;
  config?: Record<string, unknown>;
}

export interface DagEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface DagDefinition {
  nodes: DagNode[];
  edges: DagEdge[];
}
