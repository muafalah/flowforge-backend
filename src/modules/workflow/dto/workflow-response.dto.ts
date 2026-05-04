import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class WorkflowCreatorDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'john@example.com' })
  email!: string;
}

class ActiveVersionSummaryDto {
  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  id!: string;

  @ApiProperty({ example: 3 })
  version!: number;

  @ApiProperty({ example: '2026-05-04T00:00:00.000Z' })
  createdAt!: string;
}

class WorkflowDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  organizationId!: string;

  @ApiProperty({ example: 'Data Sync Pipeline' })
  name!: string;

  @ApiPropertyOptional({ example: 'Syncs data on a schedule.' })
  description?: string | null;

  @ApiProperty({
    example: 'EDITOR',
    enum: ['EDITOR', 'VIEWER'],
  })
  access!: string;

  @ApiPropertyOptional({ type: ActiveVersionSummaryDto })
  activeVersion?: ActiveVersionSummaryDto | null;

  @ApiProperty({ example: 2 })
  versionCount!: number;

  @ApiProperty({ type: WorkflowCreatorDto })
  creator!: WorkflowCreatorDto;

  @ApiProperty({ example: '2026-05-04T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-04T00:00:00.000Z' })
  updatedAt!: string;
}

class PaginationMetaDto {
  @ApiProperty({ example: 25 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;
}

export class WorkflowListResponseDto {
  @ApiProperty({ example: 'Workflows retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [WorkflowDataDto] })
  data!: WorkflowDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class WorkflowDetailResponseDto {
  @ApiProperty({ example: 'Workflow retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: WorkflowDataDto })
  data!: { workflow: WorkflowDataDto };
}

export class WorkflowCreateResponseDto {
  @ApiProperty({ example: 'Workflow created successfully.' })
  message!: string;

  @ApiProperty({ type: WorkflowDataDto })
  data!: { workflow: WorkflowDataDto };
}

export class WorkflowUpdateResponseDto {
  @ApiProperty({ example: 'Workflow updated successfully.' })
  message!: string;

  @ApiProperty({ type: WorkflowDataDto })
  data!: { workflow: WorkflowDataDto };
}

export class WorkflowDeleteResponseDto {
  @ApiProperty({ example: 'Workflow deleted successfully.' })
  message!: string;
}
