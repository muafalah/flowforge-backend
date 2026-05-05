import { execSync } from 'child_process';
import * as vm from 'vm';
import type { LogEntry, NodeRunResult, ExecutionContext } from '../types';

/**
 * Script Execution Node Executor
 * Supports JavaScript (vm sandbox), Python (child_process), and Shell (child_process)
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function executeScript(
  config: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: ExecutionContext,
): Promise<NodeRunResult> {
  const startedAt = new Date().toISOString();
  const startTime = performance.now();
  const logs: LogEntry[] = [];

  const pushLog = (level: LogEntry['level'], message: string) => {
    logs.push({ timestamp: new Date().toISOString(), level, message });
  };

  const finish = (success: boolean, output: unknown): NodeRunResult => ({
    status: success ? 'SUCCESS' : 'FAILED',
    durationMs: Math.round(performance.now() - startTime),
    startedAt,
    output,
    logs,
  });

  const language = String(
    (config.language as string | number | boolean) ?? 'javascript',
  );
  const script = String((config.script as string | number | boolean) ?? '');
  const timeoutMs = Number(config.timeoutMs ?? 30000);

  pushLog('info', `Language: ${language}`);
  pushLog('info', 'Executing script...');

  if (language === 'javascript') {
    return executeJavaScript(script, timeoutMs, pushLog, finish);
  }

  if (language === 'python') {
    return executePython(script, timeoutMs, pushLog, finish);
  }

  if (language === 'shell') {
    return executeShell(script, timeoutMs, pushLog, finish);
  }

  pushLog('error', `Unsupported language: ${language}`);
  return finish(false, {
    error: true,
    message: `Unsupported language: ${language}`,
  });
}

function executeJavaScript(
  script: string,
  timeoutMs: number,
  pushLog: (level: LogEntry['level'], message: string) => void,
  finish: (success: boolean, output: unknown) => NodeRunResult,
): NodeRunResult {
  try {
    const captured: string[] = [];

    const sandbox = {
      console: {
        log: (...args: unknown[]) => captured.push(args.map(String).join(' ')),
        warn: (...args: unknown[]) =>
          captured.push(`[WARN] ${args.map(String).join(' ')}`),
        error: (...args: unknown[]) =>
          captured.push(`[ERROR] ${args.map(String).join(' ')}`),
      },
      setTimeout,
      clearTimeout,
      JSON,
      Math,
      Date,
      Array,
      Object,
      String: globalThis.String,
      Number: globalThis.Number,
      Boolean: globalThis.Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    const context = vm.createContext(sandbox);
    const result: unknown = vm.runInContext(script, context, {
      timeout: timeoutMs,
      displayErrors: true,
    });

    for (const line of captured) pushLog('info', `stdout: ${line}`);
    pushLog('info', 'Execution completed successfully');

    return finish(true, {
      exitCode: 0,
      stdout: captured.join('\n'),
      result: result !== undefined ? result : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushLog('error', `Script error: ${msg}`);
    return finish(false, { exitCode: 1, error: msg });
  }
}

function executePython(
  script: string,
  timeoutMs: number,
  pushLog: (level: LogEntry['level'], message: string) => void,
  finish: (success: boolean, output: unknown) => NodeRunResult,
): NodeRunResult {
  try {
    const result: string = execSync(`python3 -c ${JSON.stringify(script)}`, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024, // 1MB
    });

    const stdout = result.trim();
    if (stdout) {
      for (const line of stdout.split('\n')) pushLog('info', `stdout: ${line}`);
    }
    pushLog('info', 'Execution completed successfully');

    return finish(true, { exitCode: 0, stdout, result: stdout || null });
  } catch (err: unknown) {
    const error = err as { status?: number; stderr?: string; message?: string };
    const stderr = error.stderr ?? error.message ?? 'Unknown error';
    pushLog('error', `Python error: ${stderr}`);
    return finish(false, {
      exitCode: error.status ?? 1,
      error: stderr,
    });
  }
}

function executeShell(
  script: string,
  timeoutMs: number,
  pushLog: (level: LogEntry['level'], message: string) => void,
  finish: (success: boolean, output: unknown) => NodeRunResult,
): NodeRunResult {
  try {
    const result: string = execSync(script, {
      timeout: timeoutMs,
      encoding: 'utf-8',
      shell: '/bin/bash',
      maxBuffer: 1024 * 1024, // 1MB
    });

    const stdout = result.trim();
    if (stdout) {
      for (const line of stdout.split('\n')) pushLog('info', `stdout: ${line}`);
    }
    pushLog('info', 'Execution completed successfully');

    return finish(true, { exitCode: 0, stdout, result: stdout || null });
  } catch (err: unknown) {
    const error = err as { status?: number; stderr?: string; message?: string };
    const stderr = error.stderr ?? error.message ?? 'Unknown error';
    pushLog('error', `Shell error: ${stderr}`);
    return finish(false, {
      exitCode: error.status ?? 1,
      error: stderr,
    });
  }
}
