import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowExecutionProcessor } from './workflow-execution.processor';
import { WorkflowRunGateway } from './workflow-run.gateway';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'workflow-execution',
    }),
    ElasticsearchModule,
  ],
  providers: [
    WorkflowExecutionService,
    WorkflowExecutionProcessor,
    WorkflowRunGateway,
  ],
  exports: [WorkflowExecutionService, WorkflowRunGateway],
})
export class WorkflowExecutionModule {}
