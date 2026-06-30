// Registers repeatable BullMQ jobs on boot (guards against duplicates).
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  CRON,
  JOBS,
  QUEUES,
  QUEUE_TIMEZONE,
} from '@/queue/queue.constants';

@Injectable()
export class QueueScheduler implements OnModuleInit {
  private readonly logger = new Logger(QueueScheduler.name);

  constructor(
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.ALERTS) private readonly alertsQueue: Queue,
    @InjectQueue(QUEUES.ANALYTICS) private readonly analyticsQueue: Queue,
    @InjectQueue(QUEUES.EXPIRY) private readonly expiryQueue: Queue,
  ) {}

  /** Adds cron repeatable jobs if they are not already registered. */
  async onModuleInit(): Promise<void> {
    await this.registerIngestionCrons();
    await this.registerRepeatable(
      this.alertsQueue,
      JOBS.ALERTS_DAILY,
      CRON.DAILY_DIGEST,
    );
    await this.registerRepeatable(
      this.alertsQueue,
      JOBS.ALERTS_WEEKLY,
      CRON.WEEKLY_DIGEST,
    );
    await this.registerRepeatable(
      this.analyticsQueue,
      JOBS.ANALYTICS_SNAPSHOT,
      CRON.ANALYTICS,
    );
    await this.registerRepeatable(
      this.expiryQueue,
      JOBS.EXPIRY_RUN,
      CRON.EXPIRY,
    );

    this.logger.log('BullMQ repeatable jobs registered (Asia/Dhaka)');
  }

  /** Four daily ingestion runs per plan §3. */
  private async registerIngestionCrons(): Promise<void> {
    for (const pattern of CRON.INGESTION) {
      await this.registerRepeatable(
        this.ingestionQueue,
        JOBS.INGESTION_RUN,
        pattern,
      );
    }
  }

  /** Idempotent helper — skips if an identical repeatable job already exists. */
  private async registerRepeatable(
    queue: Queue,
    name: string,
    pattern: string,
  ): Promise<void> {
    const existing = await queue.getRepeatableJobs();
    const already = existing.some(
      (j) => j.name === name && j.pattern === pattern,
    );
    if (already) {
      return;
    }

    await queue.add(
      name,
      {},
      {
        repeat: { pattern, tz: QUEUE_TIMEZONE },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    );

    this.logger.log(`Scheduled ${queue.name}/${name} → ${pattern} (${QUEUE_TIMEZONE})`);
  }
}
