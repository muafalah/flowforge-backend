import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ActorInfoDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'john@email.com' })
  email: string;
}

export class ActivityLogItemDto {
  @ApiProperty({ example: '770e8400-e29b-41d4-a716-446655440010' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  organizationId: string;

  @ApiProperty({ example: 'member.added' })
  action: string;

  @ApiProperty({ example: 'member' })
  targetType: string;

  @ApiPropertyOptional({
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  targetId?: string;

  @ApiPropertyOptional({ example: 'jane@email.com' })
  targetName?: string;

  @ApiPropertyOptional({
    example: { role: 'MEMBER' },
    description: 'Additional context for the action',
  })
  metadata?: Record<string, unknown>;

  @ApiProperty({ type: ActorInfoDto })
  actor: ActorInfoDto;

  @ApiProperty({ example: '2026-05-05T00:00:00.000Z' })
  createdAt: Date;
}

class PaginationMetaDto {
  @ApiProperty({ example: 150 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

export class ActivityLogListResponseDto {
  @ApiProperty({ example: 'Activity logs retrieved successfully.' })
  message: string;

  @ApiProperty({ type: [ActivityLogItemDto] })
  data: ActivityLogItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
