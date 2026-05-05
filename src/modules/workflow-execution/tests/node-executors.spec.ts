import { executeHttpCall } from '../node-executors/http-call.executor';
import { executeScript } from '../node-executors/script.executor';
import { executeDelay } from '../node-executors/delay.executor';
import {
  executeConditional,
  executeSetVariable,
} from '../node-executors/conditional.executor';
import type { ExecutionContext } from '../types';

describe('Node Executors', () => {
  const defaultContext: ExecutionContext = { variables: {}, inputs: [] };

  // ── HTTP Call ──
  describe('executeHttpCall', () => {
    it('should execute a successful GET request', async () => {
      // Use a known public API
      const result = await executeHttpCall(
        {
          method: 'GET',
          url: 'https://httpbin.org/get',
          headers: '{}',
          timeoutMs: 10000,
        },
        defaultContext,
      );

      expect(result.status).toBe('SUCCESS');
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.logs.length).toBeGreaterThan(0);
      expect((result.output as { statusCode: number }).statusCode).toBe(200);
    });

    it('should handle invalid URL gracefully', async () => {
      const result = await executeHttpCall(
        {
          method: 'GET',
          url: 'http://invalid-url-that-does-not-exist.test',
          timeoutMs: 3000,
        },
        defaultContext,
      );

      expect(result.status).toBe('FAILED');
      expect(result.logs.some((l) => l.level === 'error')).toBe(true);
    });

    it('should interpolate variables in URL', async () => {
      const context: ExecutionContext = {
        variables: { host: 'httpbin.org' },
        inputs: [],
      };

      const result = await executeHttpCall(
        {
          method: 'GET',
          url: 'https://@{{host}}/get',
          timeoutMs: 10000,
        },
        context,
      );

      expect(result.status).toBe('SUCCESS');
    });
  });

  // ── Script Execution ──
  describe('executeScript', () => {
    it('should execute JavaScript successfully', async () => {
      const result = await executeScript(
        {
          language: 'javascript',
          script: 'const x = 1 + 2; return x;',
          timeoutMs: 5000,
        },
        defaultContext,
      );

      expect(result.status).toBe('SUCCESS');
      expect((result.output as { result: unknown }).result).toBe(3);
    });

    it('should capture console.log output', async () => {
      const result = await executeScript(
        {
          language: 'javascript',
          script: 'console.log("hello world"); 42;',
          timeoutMs: 5000,
        },
        defaultContext,
      );

      expect(result.status).toBe('SUCCESS');
      expect(result.logs.some((l) => l.message.includes('hello world'))).toBe(
        true,
      );
    });

    it('should support top-level return statements in JavaScript', async () => {
      const result = await executeScript(
        {
          language: 'javascript',
          script: 'return 4 * 4',
          timeoutMs: 5000,
        },
        defaultContext,
      );

      expect(result.status).toBe('SUCCESS');
      expect((result.output as { result: unknown }).result).toBe(16);
    });

    it('should support multi-line scripts with return in JavaScript', async () => {
      const result = await executeScript(
        {
          language: 'javascript',
          script: 'const a = 5;\nconst b = 10;\nreturn a + b;',
          timeoutMs: 5000,
        },
        defaultContext,
      );

      expect(result.status).toBe('SUCCESS');
      expect((result.output as { result: unknown }).result).toBe(15);
    });

    it('should handle script errors', async () => {
      const result = await executeScript(
        {
          language: 'javascript',
          script: 'throw new Error("test error");',
          timeoutMs: 5000,
        },
        defaultContext,
      );

      expect(result.status).toBe('FAILED');
    });

    it('should handle unsupported languages', async () => {
      const result = await executeScript(
        {
          language: 'ruby',
          script: 'puts "hello"',
          timeoutMs: 5000,
        },
        defaultContext,
      );

      expect(result.status).toBe('FAILED');
    });
  });

  // ── Delay ──
  describe('executeDelay', () => {
    it('should wait for the specified duration', async () => {
      const result = await executeDelay({ durationMs: 100 });

      expect(result.status).toBe('SUCCESS');
      expect(result.durationMs).toBeGreaterThanOrEqual(90);
      expect((result.output as { requestedMs: number }).requestedMs).toBe(100);
    });

    it('should default to 1000ms if not specified', async () => {
      const start = Date.now();
      const result = await executeDelay({});
      const elapsed = Date.now() - start;

      expect(result.status).toBe('SUCCESS');
      expect(elapsed).toBeGreaterThanOrEqual(900);
    }, 3000);
  });

  // ── Conditional ──
  describe('executeConditional', () => {
    it('should evaluate true condition', () => {
      const result = executeConditional(
        { expression: '1 === 1', trueLabel: 'Yes', falseLabel: 'No' },
        defaultContext,
      );

      expect(result.status).toBe('SUCCESS');
      const output = result.output as {
        conditionMet: boolean;
        selectedBranch: string;
      };
      expect(output.conditionMet).toBe(true);
      expect(output.selectedBranch).toBe('Yes');
    });

    it('should evaluate false condition', () => {
      const result = executeConditional(
        { expression: '1 === 2' },
        defaultContext,
      );

      expect(result.status).toBe('SUCCESS');
      const output = result.output as { conditionMet: boolean };
      expect(output.conditionMet).toBe(false);
    });

    it('should interpolate variables', () => {
      const context: ExecutionContext = {
        variables: { status: 200 },
        inputs: [],
      };

      const result = executeConditional(
        { expression: '@{{status}} === 200' },
        context,
      );

      expect(result.status).toBe('SUCCESS');
      const output = result.output as { conditionMet: boolean };
      expect(output.conditionMet).toBe(true);
    });

    it('should handle invalid expressions', () => {
      const result = executeConditional({ expression: '((' }, defaultContext);

      expect(result.status).toBe('FAILED');
    });
  });

  // ── Set Variable ──
  describe('executeSetVariable', () => {
    it('should extract a value from input', () => {
      const context: ExecutionContext = {
        variables: {},
        inputs: [{ body: { token: 'abc123' } }],
      };

      const result = executeSetVariable(
        { variableName: 'authToken', expression: 'input.body.token' },
        context,
      );

      expect(result.status).toBe('SUCCESS');
      const output = result.output as {
        variableName: string;
        value: string;
      };
      expect(output.variableName).toBe('authToken');
      expect(output.value).toBe('abc123');
    });

    it('should handle missing input gracefully', () => {
      const result = executeSetVariable(
        { variableName: 'test', expression: 'input.missing.nested' },
        defaultContext,
      );

      expect(result.status).toBe('FAILED');
    });
  });
});
