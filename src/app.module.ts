import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { ElasticsearchModule } from './modules/elasticsearch/elasticsearch.module';
import { WorkflowExecutionModule } from './modules/workflow-execution/workflow-execution.module';
import { WorkflowRunModule } from './modules/workflow-run/workflow-run.module';
import { CronJobModule } from './modules/cron-job/cron-job.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { AiWorkflowModule } from './modules/ai-workflow/ai-workflow.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    ElasticsearchModule,
    AuthModule,
    UserModule,
    OrganizationModule,
    WorkflowModule,
    WorkflowExecutionModule,
    WorkflowRunModule,
    CronJobModule,
    WebhookModule,
    ActivityLogModule,
    AiWorkflowModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
