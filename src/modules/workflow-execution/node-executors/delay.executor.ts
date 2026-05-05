import type { LogEntry, NodeRunResult } from '../types';

/**
 * Delay Node Executor
 * Pauses execution for a specified duration.
 */
export async function executeDelay(
  config: Record<string, unknown>,
): Promise<NodeRunResult> {
  const startedAt = new Date().toISOString();
  const startTime = performance.now();
  const logs: LogEntry[] = [];

  const pushLog = (level: LogEntry['level'], message: string) => {
    logs.push({ timestamp: new Date().toISOString(), level, message });
  };

  const durationMs = Number(config.durationMs ?? 1000);
  pushLog('info', `Waiting for ${durationMs}ms...`);

  await new Promise((resolve) => setTimeout(resolve, durationMs));

  const actualMs = Math.round(performance.now() - startTime);
  pushLog('info', 'Delay completed');
  pushLog('info', 'Execution completed successfully');

  return {
    status: 'SUCCESS',
    durationMs: actualMs,
    startedAt,
    output: { waited: true, requestedMs: durationMs, actualMs },
    logs,
  };
}
