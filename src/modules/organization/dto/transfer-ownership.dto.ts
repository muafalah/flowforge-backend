import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID of the member to transfer ownership to',
  })
  memberId!: string;
}
