import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'Full name of the user',
    minLength: 1,
    maxLength: 100,
  })
  name!: string;

  @ApiProperty({
    example: 'john@email.com',
    description: 'Valid email address',
  })
  email!: string;

  @ApiProperty({
    example: 'securepassword',
    description: 'Password with minimum 8 characters',
    minLength: 8,
  })
  password!: string;
}
