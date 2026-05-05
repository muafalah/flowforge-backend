import { ApiProperty } from '@nestjs/swagger';

export class AddMemberDto {
  @ApiProperty({
    example: 'newmember@email.com',
    description: 'Email of the user to add as a member',
  })
  email!: string;
}
