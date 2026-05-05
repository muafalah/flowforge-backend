import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerRunDto {
  // Currently no body payload needed — triggers using active version
}

export class RunQueryParamsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  page?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  limit?: number;

  @ApiPropertyOptional({
    enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'],
  })
  status?: string;

  @ApiPropertyOptional({ enum: ['MANUAL', 'CRON', 'WEBHOOK'] })
  triggerType?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  sortOrder?: string;
}

export class LogQueryParamsDto {
  @ApiPropertyOptional({ description: 'Filter by node ID' })
  nodeId?: string;

  @ApiPropertyOptional({ enum: ['INFO', 'WARN', 'ERROR'] })
  level?: string;

  @ApiPropertyOptional({ default: 1 })
  page?: number;

  @ApiPropertyOptional({ default: 100, maximum: 200 })
  limit?: number;
}

class RunStepDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  id!: string;

  @ApiProperty({ example: 'node_1' })
  nodeId!: string;

  @ApiProperty({ example: 'Login API Call' })
  name!: string;

  @ApiPropertyOptional({ example: 'Calls the login endpoint' })
  description?: string;

  @ApiProperty({ example: 'http_call' })
  type!: string;

  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED'] })
  status!: string;

  @ApiPropertyOptional()
  input?: unknown;

  @ApiPropertyOptional()
  output?: unknown;

  @ApiPropertyOptional({ example: 'Connection timeout' })
  error?: string;

  @ApiProperty({ example: 0 })
  retryCount!: number;

  @ApiPropertyOptional({ example: 0 })
  executionOrder?: number;

  @ApiPropertyOptional({ example: 142 })
  durationMs?: number;

  @ApiPropertyOptional()
  startedAt?: string;

  @ApiPropertyOptional()
  finishedAt?: string;
}

class RunDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440005' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  organizationId!: string;

  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  workflowId!: string;

  @ApiProperty({ example: '770e8400-e29b-41d4-a716-446655440002' })
  workflowVersionId!: string;

  @ApiProperty({
    enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'],
  })
  status!: string;

  @ApiProperty({ enum: ['MANUAL', 'CRON', 'WEBHOOK'] })
  triggerType!: string;

  @ApiPropertyOptional()
  triggeredBy?: string;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiPropertyOptional()
  startedAt?: string;

  @ApiPropertyOptional()
  finishedAt?: string;

  @ApiPropertyOptional({ example: 2345 })
  durationMs?: number;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ type: [RunStepDataDto] })
  steps?: RunStepDataDto[];
}

class PaginationMetaDto {
  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;
}

class RunWrapperDto {
  @ApiProperty({ type: () => RunDataDto })
  run!: RunDataDto;
}

export class RunTriggerResponseDto {
  @ApiProperty({ example: 'Workflow run triggered successfully.' })
  message!: string;

  @ApiProperty({ type: () => RunWrapperDto })
  data!: RunWrapperDto;
}

export class RunListResponseDto {
  @ApiProperty({ example: 'Runs retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [RunDataDto] })
  data!: RunDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class RunDetailResponseDto {
  @ApiProperty({ example: 'Run retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: () => RunWrapperDto })
  data!: RunWrapperDto;
}

export class RunCancelResponseDto {
  @ApiProperty({ example: 'Run cancellation requested.' })
  message!: string;
}

class ExecutionLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  runId!: string;

  @ApiProperty()
  nodeId!: string;

  @ApiProperty()
  nodeName!: string;

  @ApiProperty()
  nodeType!: string;

  @ApiProperty({ enum: ['INFO', 'WARN', 'ERROR'] })
  level!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  timestamp!: string;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;
}

export class RunLogsResponseDto {
  @ApiProperty({ example: 'Logs retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [ExecutionLogDto] })
  data!: ExecutionLogDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
