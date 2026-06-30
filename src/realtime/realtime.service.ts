// Thin emit wrapper — injected into IngestionService to avoid circular imports.
import { Injectable } from '@nestjs/common';
import { JobCardDto } from '@/jobs/dto/job-response.dto';
import {
  RealtimeGateway,
  StatsUpdatePayload,
} from '@/realtime/realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  /** Push new job cards to all connected Socket.io clients. */
  emitNewJobs(jobs: JobCardDto[]): void {
    this.gateway.emitNewJobs(jobs);
  }

  /** Push updated active-job and new-today counters. */
  emitStats(payload: StatsUpdatePayload): void {
    this.gateway.emitStats(payload);
  }
}
