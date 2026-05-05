import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

export interface ExecutionLogEntry {
  logId: string;
  organizationId: string;
  runId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const INDEX_NAME = 'execution_logs';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client;

  constructor(private readonly configService: ConfigService) {
    const node =
      this.configService.get<string>('ELASTICSEARCH_URL') ||
      'http://localhost:9200';
    this.client = new Client({ node });
  }

  async onModuleInit() {
    try {
      await this.ensureIndex();
      this.logger.log('Elasticsearch index initialized successfully');
    } catch (error) {
      this.logger.warn(
        `Elasticsearch not available: ${error instanceof Error ? error.message : 'Unknown error'}. Logs will be buffered.`,
      );
    }
  }

  private async ensureIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await this.client.indices.create({
        index: INDEX_NAME,
        mappings: {
          properties: {
            logId: { type: 'keyword' },
            organizationId: { type: 'keyword' },
            runId: { type: 'keyword' },
            nodeId: { type: 'keyword' },
            nodeName: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } },
            },
            nodeType: { type: 'keyword' },
            level: { type: 'keyword' },
            message: { type: 'text' },
            timestamp: { type: 'date' },
            metadata: { type: 'object', dynamic: true },
          },
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      });
    }
  }

  async indexLog(log: ExecutionLogEntry): Promise<void> {
    try {
      await this.client.index({
        index: INDEX_NAME,
        id: log.logId,
        document: log,
      });
    } catch (error) {
      this.logger.error(
        `Failed to index log: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async indexBulkLogs(logs: ExecutionLogEntry[]): Promise<void> {
    if (logs.length === 0) return;
    try {
      const operations = logs.flatMap((log) => [
        { index: { _index: INDEX_NAME, _id: log.logId } },
        log,
      ]);
      await this.client.bulk({ operations });
    } catch (error) {
      this.logger.error(
        `Failed to bulk index logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async queryLogs(params: {
    runId: string;
    nodeId?: string;
    level?: string;
    from?: number;
    size?: number;
  }): Promise<{ logs: ExecutionLogEntry[]; total: number }> {
    const must: Record<string, unknown>[] = [{ term: { runId: params.runId } }];
    if (params.nodeId) must.push({ term: { nodeId: params.nodeId } });
    if (params.level) must.push({ term: { level: params.level } });

    try {
      const result = await this.client.search({
        index: INDEX_NAME,
        query: { bool: { must } },
        sort: [{ timestamp: { order: 'asc' as const } }],
        from: params.from ?? 0,
        size: params.size ?? 100,
      });

      const hits = result.hits.hits;
      const total =
        typeof result.hits.total === 'number'
          ? result.hits.total
          : (result.hits.total?.value ?? 0);

      return {
        logs: hits.map((hit) => hit._source as ExecutionLogEntry),
        total,
      };
    } catch (error) {
      this.logger.error(
        `Failed to query logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { logs: [], total: 0 };
    }
  }

  /** Get the underlying client for testing or advanced use */
  getClient(): Client {
    return this.client;
  }
}
