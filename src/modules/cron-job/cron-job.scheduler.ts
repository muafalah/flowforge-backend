import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CronJobService } from './cron-job.service';

@Injectable()
export class CronJobScheduler {
  private readonly logger = new Logger(CronJobScheduler.name);

  constructor(private readonly cronJobService: CronJobService) {}

  /**
   * Runs every 30 seconds to check for due cron jobs.
   * Finds all active cron jobs where nextRunAt <= now and triggers them.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCronTick() {
    this.logger.debug('Checking for due cron jobs...');
    await this.cronJobService.processDueCronJobs();
  }
}
