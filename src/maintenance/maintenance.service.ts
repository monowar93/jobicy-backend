// Database housekeeping — purges stale jobs so storage stays bounded.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@/config/configuration';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';

/** Result of a purge run (for logs / admin display). */
export interface PurgeResult {
  cutoff: Date;
  retentionDays: number;
  deleted: number;
  keptReferenced: number;
}

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Deletes jobs not seen by ingestion for `JOB_RETENTION_DAYS` (default 30).
   * Jobs a user saved or applied to are preserved so the saved/applied history
   * is never destroyed. Busts the jobs:* cache afterwards.
   */
  async purgeOldJobs(): Promise<PurgeResult> {
    const retentionDays = this.config.get('jobs', { infer: true }).retentionDays;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Stale jobs still referenced by a user are kept (reported, not deleted).
    const keptReferenced = await this.prisma.job.count({
      where: {
        lastSeenAt: { lt: cutoff },
        OR: [{ savedBy: { some: {} } }, { applications: { some: {} } }],
      },
    });

    const { count: deleted } = await this.prisma.job.deleteMany({
      where: {
        lastSeenAt: { lt: cutoff },
        savedBy: { none: {} },
        applications: { none: {} },
      },
    });

    if (deleted > 0) {
      await this.redis.delByPattern('jobs:*');
    }

    this.logger.log(
      `Purge: deleted ${deleted} jobs older than ${retentionDays}d (kept ${keptReferenced} referenced).`,
    );

    return { cutoff, retentionDays, deleted, keptReferenced };
  }
}
