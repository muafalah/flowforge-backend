import { ApiProperty } from '@nestjs/swagger';
import { MemberInfoDto } from './member-info.dto';

export class MembershipResponseDto {
  @ApiProperty({ example: 'Member retrieved successfully.' })
  message: string;

  @ApiProperty({ type: MemberInfoDto })
  data: MemberInfoDto;
}
