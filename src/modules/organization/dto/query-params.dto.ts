import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';

export class QueryParamsDto {
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
    example: 'acme',
    description: 'Search filter by name',
  })
  search?: string;

  @ApiPropertyOptional({
    example: ['OWNER', 'ADMIN'],
    description: 'Filter by member roles',
    isArray: true,
    enum: OrganizationRole,
  })
  roles?: OrganizationRole[];

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field to sort by',
    enum: ['name', 'createdAt', 'role'],
    default: 'createdAt',
  })
  sortBy!: 'name' | 'createdAt' | 'role';

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  sortOrder!: 'asc' | 'desc';
}
