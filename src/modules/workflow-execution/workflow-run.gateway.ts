import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

interface RunUpdatePayload {
  workflowId: string;
  runId: string;
  nodeId: string;
  status: string;
  timestamp: string;
  error?: string;
}

interface StepCompletePayload {
  runId: string;
  nodeId: string;
  status: string;
  output?: unknown;
  timestamp: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WorkflowRunGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WorkflowRunGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ) {
    void client.join(data.room);
    this.logger.debug(`Client ${client.id} joined room: ${data.room}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ) {
    void client.leave(data.room);
    this.logger.debug(`Client ${client.id} left room: ${data.room}`);
  }

  /** Emit a step status update to all clients watching a workflow */
  emitRunUpdate(workflowId: string, payload: RunUpdatePayload) {
    const room = `workflow-run-updates:${workflowId}`;
    this.server.to(room).emit('workflow-run-updates', payload);
  }

  /** Emit when a step completes with its output */
  emitStepComplete(workflowId: string, payload: StepCompletePayload) {
    const room = `workflow-run-updates:${workflowId}`;
    this.server.to(room).emit('step-complete', payload);
  }

  /** Emit when the entire run completes */
  emitRunComplete(
    workflowId: string,
    payload: { runId: string; status: string; durationMs: number },
  ) {
    const room = `workflow-run-updates:${workflowId}`;
    this.server.to(room).emit('run-complete', payload);
  }

  /** Emit a run update to the org-level dashboard room */
  emitDashboardRunUpdate(
    organizationId: string,
    payload: {
      runId: string;
      workflowId: string;
      workflowName: string;
      status: string;
      triggerType: string;
      durationMs?: number;
      timestamp: string;
    },
  ) {
    const room = `dashboard:${organizationId}`;
    this.server.to(room).emit('dashboard-run-update', payload);
  }

  /** Emit an activity event to the org-level activity feed room */
  emitActivityEvent(
    organizationId: string,
    payload: {
      action: string;
      targetType: string;
      targetId?: string;
      targetName?: string;
      actorName?: string;
      metadata?: Record<string, unknown>;
      timestamp: string;
    },
  ) {
    const room = `org-activity:${organizationId}`;
    this.server.to(room).emit('activity-event', payload);
  }
}
