import { Test, TestingModule } from '@nestjs/testing';
import { ElasticsearchService } from '../elasticsearch.service';
import { ConfigService } from '@nestjs/config';
import type { ExecutionLogEntry } from '../elasticsearch.service';

// Mock the @elastic/elasticsearch Client
const mockIndex = jest.fn().mockResolvedValue({});
const mockBulk = jest.fn().mockResolvedValue({});
const mockSearch = jest.fn().mockResolvedValue({
  hits: {
    hits: [],
    total: { value: 0 },
  },
});
const mockIndicesExists = jest.fn().mockResolvedValue(true);
const mockIndicesCreate = jest.fn().mockResolvedValue({});

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: mockIndex,
    bulk: mockBulk,
    search: mockSearch,
    indices: {
      exists: mockIndicesExists,
      create: mockIndicesCreate,
    },
  })),
}));

describe('ElasticsearchService', () => {
  let service: ElasticsearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElasticsearchService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:9200'),
          },
        },
      ],
    }).compile();

    service = module.get<ElasticsearchService>(ElasticsearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const sampleLog: ExecutionLogEntry = {
    logId: 'log-1',
    organizationId: 'org-1',
    runId: 'run-1',
    nodeId: 'node-1',
    nodeName: 'Test Node',
    nodeType: 'delay',
    level: 'INFO',
    message: 'Test message',
    timestamp: new Date().toISOString(),
  };

  describe('onModuleInit', () => {
    it('should initialize without throwing if ES is available', async () => {
      mockIndicesExists.mockResolvedValueOnce(true);
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should create index if it does not exist', async () => {
      mockIndicesExists.mockResolvedValueOnce(false);
      await service.onModuleInit();
      expect(mockIndicesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'execution_logs',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          mappings: expect.any(Object),
        }),
      );
    });

    it('should handle ES unavailability gracefully', async () => {
      mockIndicesExists.mockRejectedValueOnce(new Error('Connection refused'));
      // Should not throw — logs a warning instead
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('indexLog', () => {
    it('should index a single log entry', async () => {
      await service.indexLog(sampleLog);

      expect(mockIndex).toHaveBeenCalledWith({
        index: 'execution_logs',
        id: 'log-1',
        document: sampleLog,
      });
    });

    it('should not throw on indexing error', async () => {
      mockIndex.mockRejectedValueOnce(new Error('Index failed'));
      await expect(service.indexLog(sampleLog)).resolves.not.toThrow();
    });
  });

  describe('indexBulkLogs', () => {
    it('should bulk index multiple logs', async () => {
      const logs: ExecutionLogEntry[] = [
        sampleLog,
        { ...sampleLog, logId: 'log-2', message: 'Second log' },
      ];

      await service.indexBulkLogs(logs);

      expect(mockBulk).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        operations: expect.arrayContaining([
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            index: expect.objectContaining({ _index: 'execution_logs' }),
          }),
        ]),
      });
    });

    it('should skip when logs array is empty', async () => {
      await service.indexBulkLogs([]);
      expect(mockBulk).not.toHaveBeenCalled();
    });

    it('should not throw on bulk indexing error', async () => {
      mockBulk.mockRejectedValueOnce(new Error('Bulk failed'));
      await expect(service.indexBulkLogs([sampleLog])).resolves.not.toThrow();
    });
  });

  describe('queryLogs', () => {
    it('should query logs by runId', async () => {
      const mockHits = [
        { _source: sampleLog },
        { _source: { ...sampleLog, logId: 'log-2' } },
      ];
      mockSearch.mockResolvedValueOnce({
        hits: {
          hits: mockHits,
          total: { value: 2 },
        },
      });

      const result = await service.queryLogs({ runId: 'run-1' });

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'execution_logs',
          query: {
            bool: {
              must: [{ term: { runId: 'run-1' } }],
            },
          },
        }),
      );
      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should add nodeId filter when provided', async () => {
      mockSearch.mockResolvedValueOnce({
        hits: { hits: [], total: { value: 0 } },
      });

      await service.queryLogs({ runId: 'run-1', nodeId: 'node-1' });

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: {
              must: [
                { term: { runId: 'run-1' } },
                { term: { nodeId: 'node-1' } },
              ],
            },
          },
        }),
      );
    });

    it('should add level filter when provided', async () => {
      mockSearch.mockResolvedValueOnce({
        hits: { hits: [], total: { value: 0 } },
      });

      await service.queryLogs({ runId: 'run-1', level: 'ERROR' });

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: {
              must: [
                { term: { runId: 'run-1' } },
                { term: { level: 'ERROR' } },
              ],
            },
          },
        }),
      );
    });

    it('should support pagination with from/size', async () => {
      mockSearch.mockResolvedValueOnce({
        hits: { hits: [], total: { value: 0 } },
      });

      await service.queryLogs({
        runId: 'run-1',
        from: 20,
        size: 50,
      });

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 20,
          size: 50,
        }),
      );
    });

    it('should return empty result on search error', async () => {
      mockSearch.mockRejectedValueOnce(new Error('Search failed'));

      const result = await service.queryLogs({ runId: 'run-1' });
      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle total as a number', async () => {
      mockSearch.mockResolvedValueOnce({
        hits: {
          hits: [{ _source: sampleLog }],
          total: 5,
        },
      });

      const result = await service.queryLogs({ runId: 'run-1' });
      expect(result.total).toBe(5);
    });
  });

  describe('getClient', () => {
    it('should return the underlying ES client', () => {
      const client = service.getClient();
      expect(client).toBeDefined();
      expect(client.index).toBeDefined();
    });
  });
});
