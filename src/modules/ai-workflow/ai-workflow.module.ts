import { Module } from '@nestjs/common';
import { AiWorkflowController } from './ai-workflow.controller';
import { AiWorkflowService } from './ai-workflow.service';

@Module({
  controllers: [AiWorkflowController],
  providers: [AiWorkflowService],
  exports: [AiWorkflowService],
})
export class AiWorkflowModule {}
