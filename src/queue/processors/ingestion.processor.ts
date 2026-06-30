// Ingestion queue processor — scheduled + manual fetch runs.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IngestionService } from '@/ingestion/ingestion.service';
import { QUEUES } from '@/queue/queue.constants';

@Processor(QUEUES.INGESTION)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly ingestionService: IngestionService) {
    super();
  }

  /** Runs the full multi-source ingestion pipeline. */
  async process(job: Job): Promise<void> {
    this.logger.log(`Processing ingestion job id=${job.id}`);
    const result = await this.ingestionService.run();
    this.logger.log(`Ingestion job complete: ${JSON.stringify(result)}`);
  }
}
