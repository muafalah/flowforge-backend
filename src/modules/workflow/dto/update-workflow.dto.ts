import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkflowDto {
  @ApiPropertyOptional({
    example: 'Updated Pipeline Name',
    description: 'New name for the workflow',
    minLength: 3,
    maxLength: 100,
  })
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated description of the workflow.',
    description: 'New description for the workflow (null to clear)',
    maxLength: 500,
  })
  description?: string | null;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    description: 'Workflow status',
    enum: ['ACTIVE', 'DRAFT'],
  })
  status?: 'ACTIVE' | 'DRAFT';

  @ApiPropertyOptional({
    example: 'VIEWER',
    description:
      'Default access level for MEMBER role users. OWNER/ADMIN always have full access.',
    enum: ['EDITOR', 'VIEWER'],
  })
  access?: 'EDITOR' | 'VIEWER';
}
