import { ApiProperty } from '@nestjs/swagger';
import { MemberInfoDto } from './member-info.dto';

class PaginationMetaDto {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;
}

export class MembersListResponseDto {
  @ApiProperty({ example: 'Members retrieved successfully.' })
  message: string;

  @ApiProperty({ type: [MemberInfoDto] })
  data: MemberInfoDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
