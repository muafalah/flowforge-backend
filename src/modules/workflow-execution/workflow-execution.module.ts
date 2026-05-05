import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowExecutionProcessor } from './workflow-execution.processor';
import { WorkflowRunGateway } from './workflow-run.gateway';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'workflow-execution',
    }),
  ],
  providers: [
    WorkflowExecutionService,
    WorkflowExecutionProcessor,
    WorkflowRunGateway,
  ],
  exports: [WorkflowExecutionService, WorkflowRunGateway],
})
export class WorkflowExecutionModule {}
