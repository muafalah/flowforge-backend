import { ApiPropertyOptional } from '@nestjs/swagger';

export class ActivityLogQueryParamsDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for pagination',
    default: 1,
    minimum: 1,
  })
  page!: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  limit!: number;

  @ApiPropertyOptional({
    example: 'workflow',
    description: 'Search filter by target name',
  })
  search?: string;

  @ApiPropertyOptional({
    example: 'member.added',
    description: 'Filter by action type',
  })
  action?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Filter by actor user ID',
  })
  actorId?: string;

  @ApiPropertyOptional({
    example: 'workflow',
    description:
      'Filter by target type (member, workflow, organization, version, run)',
  })
  targetType?: string;

  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Filter logs created after this date',
  })
  startDate?: Date;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    description: 'Filter logs created before this date',
  })
  endDate?: Date;

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Sort direction by date',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  sortOrder!: 'asc' | 'desc';
}
