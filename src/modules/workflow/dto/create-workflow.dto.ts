import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkflowDto {
  @ApiProperty({
    example: 'Data Sync Pipeline',
    description: 'Name of the workflow',
    minLength: 3,
    maxLength: 100,
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'Syncs data from source to destination on a schedule.',
    description: 'Description of the workflow',
    maxLength: 500,
  })
  description?: string;

  @ApiPropertyOptional({
    example: 'EDITOR',
    description:
      'Default access level for MEMBER role users. OWNER/ADMIN always have full access.',
    enum: ['EDITOR', 'VIEWER'],
    default: 'EDITOR',
  })
  access?: 'EDITOR' | 'VIEWER';
}
