import type { LogEntry, NodeRunResult, ExecutionContext } from '../types';

/**
 * HTTP Call Node Executor
 * Performs HTTP requests using native fetch (server-side, no CORS issues)
 */
export async function executeHttpCall(
  config: Record<string, unknown>,
  context: ExecutionContext,
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

  const method = String((config.method as string | number | boolean) ?? 'GET');
  const url = interpolateTemplate(
    String((config.url as string | number | boolean) ?? ''),
    context.variables,
  );

  let parsedHeaders: Record<string, string> = {};
  try {
    const headersRaw = String(
      (config.headers as string | number | boolean) ?? '{}',
    );
    const headersInterpolated = interpolateTemplate(
      headersRaw,
      context.variables,
    );
    parsedHeaders = JSON.parse(headersInterpolated) as Record<string, string>;
  } catch {
    parsedHeaders = {};
    pushLog('warn', 'Could not parse headers JSON, using empty headers');
  }

  pushLog('info', `${method} ${url}`);
  pushLog('info', 'Sending request...');

  try {
    const bodyRaw = String(
      (config.body as string | number | boolean) ?? '',
    ).trim();
    const body = interpolateTemplate(bodyRaw, context.variables);

    if (body && method !== 'GET' && method !== 'HEAD') {
      const hasContentType = Object.keys(parsedHeaders).some(
        (k) => k.toLowerCase() === 'content-type',
      );
      if (!hasContentType && (body.startsWith('{') || body.startsWith('['))) {
        parsedHeaders['Content-Type'] = 'application/json';
        pushLog('info', 'Auto-set Content-Type: application/json');
      }
    }

    const timeoutMs = Number(config.timeoutMs ?? 30000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOpts: RequestInit = {
      method,
      headers: parsedHeaders,
      signal: controller.signal,
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOpts.body = body;
    }

    const res = await fetch(url, fetchOpts);
    clearTimeout(timeout);

    pushLog(
      res.ok ? 'info' : 'warn',
      `Received response: ${res.status} ${res.statusText}`,
    );

    let responseBody: unknown;
    const ct = res.headers.get('content-type') ?? '';
    try {
      responseBody = ct.includes('application/json')
        ? await res.json()
        : await res.text();
    } catch {
      responseBody = '(Could not read response body)';
    }

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    pushLog(
      res.ok ? 'info' : 'error',
      res.ok
        ? 'Execution completed successfully'
        : `Request failed with status ${res.status}`,
    );

    return finish(res.ok, {
      statusCode: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body: responseBody,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    pushLog('error', `Request failed: ${msg}`);
    return finish(false, { error: true, message: msg });
  }
}

/** Simple template interpolation: replaces @{{varName}} with variable values */
function interpolateTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/@\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const value = variables[varName];
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return '';
  });
}
