import { Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogListener } from './activity-log.listener';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkflowExecutionModule } from '../workflow-execution/workflow-execution.module';

@Module({
  imports: [WorkflowExecutionModule],
  controllers: [ActivityLogController],
  providers: [ActivityLogService, ActivityLogListener, RolesGuard],
  exports: [ActivityLogService],
})
export class ActivityLogModule {}
