import { ApiProperty } from '@nestjs/swagger';

// ── Stats ──

class HourlyRunDataDto {
  @ApiProperty({ example: '2026-05-05T10:00:00.000Z' })
  hour!: string;

  @ApiProperty({ example: 12 })
  success!: number;

  @ApiProperty({ example: 2 })
  failed!: number;
}

class DashboardStatsDataDto {
  @ApiProperty({ example: 3 })
  activeRuns!: number;

  @ApiProperty({ example: 247 })
  totalRuns24h!: number;

  @ApiProperty({ example: 234 })
  successCount24h!: number;

  @ApiProperty({ example: 13 })
  failedCount24h!: number;

  @ApiProperty({ example: 94.2 })
  successRate24h!: number;

  @ApiProperty({ example: 12400 })
  avgDurationMs24h!: number;

  @ApiProperty({ example: 8 })
  totalWorkflows!: number;

  @ApiProperty({ type: [HourlyRunDataDto] })
  hourlyRuns!: HourlyRunDataDto[];
}

export class DashboardStatsResponseDto {
  @ApiProperty({ example: 'Dashboard stats retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: DashboardStatsDataDto })
  data!: DashboardStatsDataDto;
}

// ── Recent Runs ──

class RecentRunDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  workflowId!: string;

  @ApiProperty({ example: 'Daily ETL Pipeline' })
  workflowName!: string;

  @ApiProperty({ example: 'SUCCESS' })
  status!: string;

  @ApiProperty({ example: 'MANUAL' })
  triggerType!: string;

  @ApiProperty({
    example: '770e8400-e29b-41d4-a716-446655440002',
    nullable: true,
  })
  triggeredBy!: string | null;

  @ApiProperty({ example: 'John Doe', nullable: true })
  triggeredUserName!: string | null;

  @ApiProperty({ example: 3200, nullable: true })
  durationMs!: number | null;

  @ApiProperty({ example: '2026-05-05T10:30:00.000Z', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ example: '2026-05-05T10:30:00.000Z' })
  createdAt!: string;
}

class PaginationMetaDto {
  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;
}

export class RecentRunsResponseDto {
  @ApiProperty({ example: 'Recent runs retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [RecentRunDataDto] })
  data!: RecentRunDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

// ── Workflow Summary ──

class WorkflowSummaryDataDto {
  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  id!: string;

  @ApiProperty({ example: 'Daily ETL Pipeline' })
  name!: string;

  @ApiProperty({ example: 'Syncs data from external source', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 'SUCCESS', nullable: true })
  lastRunStatus!: string | null;

  @ApiProperty({ example: 3200, nullable: true })
  lastRunDuration!: number | null;

  @ApiProperty({ example: '2026-05-05T10:30:00.000Z', nullable: true })
  lastRunAt!: string | null;

  @ApiProperty({ example: 15 })
  totalRuns24h!: number;

  @ApiProperty({ example: 14 })
  successCount24h!: number;

  @ApiProperty({
    description: 'Active version DAG definition for mini preview',
    nullable: true,
  })
  activeVersionDefinition!: unknown;
}

export class WorkflowSummaryResponseDto {
  @ApiProperty({ example: 'Workflow summary retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [WorkflowSummaryDataDto] })
  data!: WorkflowSummaryDataDto[];
}
