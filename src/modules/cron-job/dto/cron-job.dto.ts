import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCronJobDto {
  @ApiProperty({ example: 'Nightly Sync', description: 'Name of the cron job' })
  name!: string;

  @ApiPropertyOptional({ example: 'Runs data sync every night at midnight' })
  description?: string;

  @ApiProperty({
    example: '0 0 * * *',
    description: 'Cron expression (5 or 6 parts)',
  })
  cronExpression!: string;

  @ApiPropertyOptional({ example: 'Asia/Jakarta', default: 'UTC' })
  timezone?: string;
}

export class UpdateCronJobDto {
  @ApiPropertyOptional({ example: 'Updated Sync' })
  name?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ example: '*/30 * * * *' })
  cronExpression?: string;

  @ApiPropertyOptional({ example: 'UTC' })
  timezone?: string;

  @ApiPropertyOptional({ example: false })
  isActive?: boolean;
}

class CronJobDataDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() workflowId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() cronExpression!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() lastRunAt?: string;
  @ApiPropertyOptional() nextRunAt?: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

class PaginationMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

class CronJobWrapperDto {
  @ApiProperty({ type: () => CronJobDataDto })
  cronJob!: CronJobDataDto;
}

export class CronJobCreateResponseDto {
  @ApiProperty({ example: 'Cron job created successfully.' })
  message!: string;

  @ApiProperty({ type: () => CronJobWrapperDto })
  data!: CronJobWrapperDto;
}

export class CronJobListResponseDto {
  @ApiProperty({ example: 'Cron jobs retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [CronJobDataDto] })
  data!: CronJobDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class CronJobUpdateResponseDto {
  @ApiProperty({ example: 'Cron job updated successfully.' })
  message!: string;

  @ApiProperty({ type: () => CronJobWrapperDto })
  data!: CronJobWrapperDto;
}

export class CronJobDeleteResponseDto {
  @ApiProperty({ example: 'Cron job deleted successfully.' })
  message!: string;
}
