import { ApiProperty } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';

class MemberUserInfoDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'john@email.com' })
  email: string;
}

class MemberOrganizationInfoDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Acme Corp' })
  name: string;
}

export class MemberInfoDto {
  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  organizationId: string;

  @ApiProperty({ enum: OrganizationRole, example: 'MEMBER' })
  role: OrganizationRole;

  @ApiProperty({ example: '2026-05-04T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-04T00:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ type: MemberUserInfoDto })
  user: MemberUserInfoDto;

  @ApiProperty({ type: MemberOrganizationInfoDto, required: false })
  organization?: MemberOrganizationInfoDto;
}
