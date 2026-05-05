import * as vm from 'vm';
import type { LogEntry, NodeRunResult, ExecutionContext } from '../types';

/**
 * Conditional Node Executor
 * Evaluates a JavaScript expression and returns true/false branch info.
 */
export function executeConditional(
  config: Record<string, unknown>,
  context: ExecutionContext,
): NodeRunResult {
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

  const rawExpression =
    String((config.expression as string | number | boolean) ?? '').trim() ||
    'false';
  const expression = interpolateExpression(rawExpression, context.variables);

  try {
    if (rawExpression !== expression) {
      pushLog('info', `Expression: ${rawExpression}`);
      pushLog('info', `Interpolated: ${expression}`);
    } else {
      pushLog('info', `Evaluating: ${expression}`);
    }

    const sandbox = {
      variables: context.variables,
      inputs: context.inputs,
      JSON,
      Math,
      String: globalThis.String,
      Number: globalThis.Number,
      Boolean: globalThis.Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    const vmContext = vm.createContext(sandbox);
    const result = Boolean(
      vm.runInContext(`(${expression})`, vmContext, { timeout: 5000 }),
    );

    const branch = result
      ? String((config.trueLabel as string | number | boolean) ?? 'Yes')
      : String((config.falseLabel as string | number | boolean) ?? 'No');

    pushLog('info', `Result: ${result} → branch "${branch}"`);
    pushLog('info', 'Execution completed successfully');
    return finish(true, { conditionMet: result, selectedBranch: branch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushLog('error', `Failed to evaluate condition: ${msg}`);
    return finish(false, { error: true, message: msg });
  }
}

/**
 * Set Variable Node Executor
 * Extracts a value from the first input and stores it as a named variable.
 */
export function executeSetVariable(
  config: Record<string, unknown>,
  context: ExecutionContext,
): NodeRunResult {
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

  const varName = String(
    (config.variableName as string | number | boolean) ?? '',
  );
  const expression = String(
    (config.expression as string | number | boolean) ?? '',
  );

  pushLog('info', `Variable Name: ${varName}`);
  pushLog('info', `Expression: ${expression}`);

  try {
    const input = context.inputs[0] ?? {};
    const sandbox = {
      input,
      JSON,
      Math,
      String: globalThis.String,
      Number: globalThis.Number,
      Boolean: globalThis.Boolean,
      parseInt,
      parseFloat,
    };

    const vmContext = vm.createContext(sandbox);
    const value: unknown = vm.runInContext(expression, vmContext, {
      timeout: 5000,
    });

    pushLog('info', 'Extracted value successfully');
    pushLog('info', 'Execution completed successfully');
    return finish(true, { variableName: varName, value });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushLog('error', `Failed to evaluate expression: ${msg}`);
    return finish(false, { error: true, message: msg });
  }
}

/** Interpolate @{{varName}} templates in expressions */
function interpolateExpression(
  expression: string,
  variables: Record<string, unknown>,
): string {
  return expression.replace(/@\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const value = variables[varName];
    if (value === undefined || value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return '';
  });
}
