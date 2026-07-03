// Analytics queue processor — nightly snapshot at 00:00 Asia/Dhaka.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalyticsAggregatorService } from '@/analytics/analytics-aggregator.service';
import { QUEUES, WORKER_IDLE_OPTIONS } from '@/queue/queue.constants';

@Processor(QUEUES.ANALYTICS, WORKER_IDLE_OPTIONS)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    private readonly aggregator: AnalyticsAggregatorService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.log('Running nightly analytics snapshot');
    await this.aggregator.runDailySnapshot();
  }
}
