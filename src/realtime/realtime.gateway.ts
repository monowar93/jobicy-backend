// Socket.io gateway — broadcasts job:new and stats:update to connected clients.
import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JobCardDto } from '@/jobs/dto/job-response.dto';

/** Live platform stats payload (mirrors 02-api-contracts socket events). */
export interface StatsUpdatePayload {
  totalActiveJobs: number;
  newJobsToday: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Log new socket connections (read-only stream for MVP). */
  handleConnection(): void {
    this.logger.debug('Socket client connected');
  }

  /** Log disconnects for observability. */
  handleDisconnect(): void {
    this.logger.debug('Socket client disconnected');
  }

  /**
   * Broadcast newly ingested jobs (max 10 per event per contract).
   */
  emitNewJobs(jobs: JobCardDto[]): void {
    if (!this.server) {
      this.logger.warn('Socket server not ready — skipping job:new emit');
      return;
    }
    const payload = { jobs: jobs.slice(0, 10) };
    this.server.emit('job:new', payload);
    this.logger.log(`Emitted job:new (${payload.jobs.length} jobs)`);
  }

  /**
   * Broadcast updated platform counters after ingestion.
   */
  emitStats(payload: StatsUpdatePayload): void {
    if (!this.server) {
      this.logger.warn('Socket server not ready — skipping stats:update emit');
      return;
    }
    this.server.emit('stats:update', payload);
    this.logger.log(
      `Emitted stats:update active=${payload.totalActiveJobs} newToday=${payload.newJobsToday}`,
    );
  }
}
