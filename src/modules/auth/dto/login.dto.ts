import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'john@email.com',
    description: 'Email address of the user',
  })
  email!: string;

  @ApiProperty({
    example: 'securepassword',
    description: 'Password of the user',
    minLength: 8,
  })
  password!: string;
}
