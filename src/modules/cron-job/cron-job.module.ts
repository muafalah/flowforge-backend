import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobController } from './cron-job.controller';
import { CronJobService } from './cron-job.service';
import { CronJobScheduler } from './cron-job.scheduler';
import { WorkflowRunModule } from '../workflow-run/workflow-run.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [ScheduleModule.forRoot(), WorkflowRunModule],
  controllers: [CronJobController],
  providers: [CronJobService, CronJobScheduler, RolesGuard],
  exports: [CronJobService],
})
export class CronJobModule {}
