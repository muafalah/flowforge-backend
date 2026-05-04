import { ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowQueryParamsDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for pagination',
    default: 1,
    minimum: 1,
  })
  page!: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Number of items per page',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  limit!: number;

  @ApiPropertyOptional({
    example: 'data sync',
    description: 'Search filter by workflow name',
  })
  search?: string;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    description: 'Filter by workflow status',
    enum: ['ACTIVE', 'DRAFT'],
  })
  status?: 'ACTIVE' | 'DRAFT';

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field to sort by',
    enum: ['name', 'createdAt', 'status'],
    default: 'createdAt',
  })
  sortBy!: 'name' | 'createdAt' | 'status';

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  sortOrder!: 'asc' | 'desc';
}

export class VersionQueryParamsDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for pagination',
    default: 1,
    minimum: 1,
  })
  page!: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Number of items per page',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  limit!: number;

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Sort direction by version number',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  sortOrder!: 'asc' | 'desc';
}
