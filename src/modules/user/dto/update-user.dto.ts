import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Jane Doe',
    description: 'Updated name of the user',
    minLength: 1,
    maxLength: 100,
  })
  name!: string;
}
