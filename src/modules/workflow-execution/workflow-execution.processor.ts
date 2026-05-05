import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowRunGateway } from './workflow-run.gateway';
import type { WorkflowRunJobData } from './types';

@Processor('workflow-execution')
export class WorkflowExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowExecutionProcessor.name);

  constructor(
    private readonly executionService: WorkflowExecutionService,
    private readonly runGateway: WorkflowRunGateway,
  ) {
    super();
  }

  async process(job: Job<WorkflowRunJobData>): Promise<void> {
    const { runId, workflowId } = job.data;
    this.logger.log(`Processing workflow run: ${runId}`);

    await this.executionService.executeRun(
      job.data,
      (nodeId, status, output) => {
        // Emit real-time updates via WebSocket
        this.runGateway.emitRunUpdate(workflowId, {
          workflowId,
          runId,
          nodeId,
          status,
          timestamp: new Date().toISOString(),
        });

        // If run completed (final step), emit completion event
        if (
          status === 'SUCCESS' ||
          status === 'FAILED' ||
          status === 'SKIPPED'
        ) {
          this.runGateway.emitStepComplete(workflowId, {
            runId,
            nodeId,
            status,
            output,
            timestamp: new Date().toISOString(),
          });
        }
      },
    );

    this.logger.log(`Workflow run completed: ${runId}`);
  }
}
