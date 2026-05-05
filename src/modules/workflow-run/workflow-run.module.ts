import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowRunController } from './workflow-run.controller';
import { WorkflowRunService } from './workflow-run.service';
import { WorkflowExecutionModule } from '../workflow-execution/workflow-execution.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'workflow-execution',
    }),
    WorkflowExecutionModule,
  ],
  controllers: [WorkflowRunController],
  providers: [WorkflowRunService],
  exports: [WorkflowRunService],
})
export class WorkflowRunModule {}
