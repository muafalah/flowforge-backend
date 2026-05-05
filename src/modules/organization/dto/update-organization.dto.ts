import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrganizationDto {
  @ApiProperty({
    example: 'Acme Corp Renamed',
    description: 'New name of the organization',
    minLength: 3,
    maxLength: 100,
  })
  name!: string;
}
