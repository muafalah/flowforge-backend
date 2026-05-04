import { ApiProperty } from '@nestjs/swagger';
import { MemberInfoDto } from './member-info.dto';

class MemberDataWrapperDto {
  @ApiProperty({ type: MemberInfoDto })
  member: MemberInfoDto;
}

export class MembershipActionResponseDto {
  @ApiProperty({ example: 'Action performed successfully.' })
  message: string;

  @ApiProperty({ type: MemberDataWrapperDto })
  data: MemberDataWrapperDto;
}
