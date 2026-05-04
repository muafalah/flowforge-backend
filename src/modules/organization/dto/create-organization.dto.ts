import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Acme Corporation',
    description: 'Name of the organization',
    minLength: 3,
    maxLength: 100,
  })
  name!: string;
}
