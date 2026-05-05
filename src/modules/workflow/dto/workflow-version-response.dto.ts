import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class VersionCreatorDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'john@example.com' })
  email!: string;
}

class VersionDataDto {
  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  workflowId!: string;

  @ApiProperty({ example: 3 })
  version!: number;

  @ApiProperty({
    example: {
      nodes: [
        { id: 'step1', type: 'http' },
        { id: 'step2', type: 'script' },
      ],
      edges: [{ from: 'step1', to: 'step2' }],
    },
  })
  definition!: Record<string, unknown>;

  @ApiProperty({ example: false })
  isActive!: boolean;

  @ApiPropertyOptional({
    example: ['step1', 'step2'],
    description: 'Topological execution order (returned on version creation)',
    type: [String],
  })
  executionOrder?: string[];

  @ApiProperty({ type: VersionCreatorDto })
  creator!: VersionCreatorDto;

  @ApiProperty({ example: '2026-05-04T00:00:00.000Z' })
  createdAt!: string;
}

class PaginationMetaDto {
  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;
}

export class VersionListResponseDto {
  @ApiProperty({ example: 'Versions retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [VersionDataDto] })
  data!: VersionDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class VersionCreateResponseDto {
  @ApiProperty({ example: 'Version created successfully.' })
  message!: string;

  @ApiProperty({ type: VersionDataDto })
  data!: { version: VersionDataDto };
}

export class VersionActivateResponseDto {
  @ApiProperty({ example: 'Version activated successfully.' })
  message!: string;

  @ApiProperty({ type: VersionDataDto })
  data!: { version: VersionDataDto };
}
