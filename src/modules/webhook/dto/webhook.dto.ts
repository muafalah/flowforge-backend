import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ example: 'GitHub Push Hook' })
  name!: string;

  @ApiPropertyOptional({ example: 'Triggers on push events' })
  description?: string;
}

export class UpdateWebhookDto {
  @ApiPropertyOptional({ example: 'Updated Hook Name' })
  name?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ example: false })
  isActive?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Set to true to regenerate the webhook secret',
  })
  regenerateSecret?: boolean;
}

class WebhookDataDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() workflowId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({
    description: 'Auto-generated secret for signature validation',
  })
  secret!: string;
  @ApiProperty({ description: 'Unique URL path for the webhook endpoint' })
  urlPath!: string;
  @ApiProperty({ description: 'Full webhook URL' })
  webhookUrl!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

class PaginationMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

class WebhookWrapperDto {
  @ApiProperty({ type: () => WebhookDataDto })
  webhook!: WebhookDataDto;
}

export class WebhookCreateResponseDto {
  @ApiProperty({ example: 'Webhook created successfully.' })
  message!: string;

  @ApiProperty({ type: () => WebhookWrapperDto })
  data!: WebhookWrapperDto;
}

export class WebhookListResponseDto {
  @ApiProperty({ example: 'Webhooks retrieved successfully.' })
  message!: string;

  @ApiProperty({ type: [WebhookDataDto] })
  data!: WebhookDataDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class WebhookUpdateResponseDto {
  @ApiProperty({ example: 'Webhook updated successfully.' })
  message!: string;

  @ApiProperty({ type: () => WebhookWrapperDto })
  data!: WebhookWrapperDto;
}

export class WebhookDeleteResponseDto {
  @ApiProperty({ example: 'Webhook deleted successfully.' })
  message!: string;
}

export class WebhookTriggerResponseDto {
  @ApiProperty({ example: 'Webhook received. Run triggered.' })
  message!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440005' })
  runId!: string;
}
