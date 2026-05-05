import { ApiProperty } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @ApiProperty({
    example: 'ADMIN',
    description: 'New role for the member (ADMIN or MEMBER)',
    enum: [OrganizationRole.ADMIN, OrganizationRole.MEMBER],
  })
  role!: 'ADMIN' | 'MEMBER';
}
