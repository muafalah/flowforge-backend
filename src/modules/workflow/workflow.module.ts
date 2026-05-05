import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowVersionController } from './workflow-version.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowVersionService } from './workflow-version.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [WorkflowController, WorkflowVersionController],
  providers: [WorkflowService, WorkflowVersionService, RolesGuard],
  exports: [WorkflowService, WorkflowVersionService],
})
export class WorkflowModule {}
