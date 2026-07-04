// Expiry processor — deactivate jobs unseen >7d, purge unreferenced after retention.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { MaintenanceService } from '@/maintenance/maintenance.service';
import { QUEUES, WORKER_IDLE_OPTIONS } from '@/queue/queue.constants';

@Processor(QUEUES.EXPIRY, WORKER_IDLE_OPTIONS)
export class ExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(ExpiryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly maintenance: MaintenanceService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Stage 1: mark jobs not seen in 7 days as inactive.
    const { count: deactivated } = await this.prisma.job.updateMany({
      where: { lastSeenAt: { lt: cutoff }, isActive: true },
      data: { isActive: false },
    });

    if (deactivated > 0) {
      await this.redis.invalidateCache('jobs');
      await this.redis.invalidateCache('analytics');
    }

    this.logger.log(`Deactivated ${deactivated} stale job(s)`);

    // Stage 2: delete unreferenced jobs unseen longer than JOB_RETENTION_DAYS.
    const purge = await this.maintenance.purgeOldJobs();
    this.logger.log(
      `Purge complete: deleted=${purge.deleted} keptReferenced=${purge.keptReferenced}`,
    );
  }
}
