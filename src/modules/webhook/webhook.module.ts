import { Module } from '@nestjs/common';
import {
  WebhookManagementController,
  WebhookReceiverController,
} from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WorkflowRunModule } from '../workflow-run/workflow-run.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [WorkflowRunModule],
  controllers: [WebhookManagementController, WebhookReceiverController],
  providers: [WebhookService, RolesGuard],
  exports: [WebhookService],
})
export class WebhookModule {}
