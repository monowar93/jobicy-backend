// Admin business logic — platform stats, fetch logs, queue monitor, user list.
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FetchLog } from '@/generated/prisma';
import { toUserDto } from '@/auth/dto/user-response.dto';
import { buildMeta } from '@/common/utils/pagination.util';
import { PrismaService } from '@/prisma/prisma.service';
import { JOBS, QUEUES } from '@/queue/queue.constants';

/** Platform-wide counts for the admin dashboard. */
export interface AdminStatsDto {
  users: number;
  jobs: number;
  activeJobs: number;
  alerts: number;
  applications: number;
}

/** Ingestion run history row (mirrors 02-api-contracts.md §8). */
export interface FetchLogDto {
  id: string;
  source: FetchLog['source'];
  status: FetchLog['status'];
  jobsFetched: number;
  jobsNew: number;
  jobsDuplicate: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

/** BullMQ queue health snapshot. */
export interface QueueStatusDto {
  name: string;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
}

/** Maps a Prisma FetchLog row to the public API shape. */
function toFetchLogDto(log: FetchLog): FetchLogDto {
  return {
    id: log.id,
    source: log.source,
    status: log.status,
    jobsFetched: log.jobsFetched,
    jobsNew: log.jobsNew,
    jobsDuplicate: log.jobsDuplicate,
    errors: log.errors,
    startedAt: log.startedAt.toISOString(),
    finishedAt: log.finishedAt?.toISOString() ?? null,
    durationMs: log.durationMs,
  };
}

@Injectable()
export class AdminService {
  private queueStatsCache: { data: QueueStatusDto[]; at: number } | null = null;

  private static readonly QUEUE_STATS_TTL_MS = 20_000;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.ALERTS) private readonly alertsQueue: Queue,
    @InjectQueue(QUEUES.ANALYTICS) private readonly analyticsQueue: Queue,
    @InjectQueue(QUEUES.EXPIRY) private readonly expiryQueue: Queue,
  ) {}

  /** Parallel counts across core tables for the admin overview. */
  async stats(): Promise<AdminStatsDto> {
    const [users, jobs, activeJobs, alerts, applications] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.job.count(),
      this.prisma.job.count({ where: { isActive: true } }),
      this.prisma.alert.count(),
      this.prisma.application.count(),
    ]);

    return { users, jobs, activeJobs, alerts, applications };
  }

  /** Paginated fetch logs, newest first. */
  async fetchLogs(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.fetchLog.findMany({
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.fetchLog.count(),
    ]);

    return {
      data: logs.map(toFetchLogDto),
      meta: buildMeta(total, page, limit),
    };
  }

  /** Enqueue a one-off ingestion run (processed by IngestionProcessor). */
  async triggerFetch(): Promise<{ enqueued: true; jobId: string }> {
    const job = await this.ingestionQueue.add(JOBS.INGESTION_RUN, {}, {
      removeOnComplete: 50,
      removeOnFail: 20,
    });

    return { enqueued: true, jobId: String(job.id) };
  }

  /** Live BullMQ job counts for every registered queue (cached ~20s). */
  async queues(): Promise<QueueStatusDto[]> {
    const now = Date.now();
    if (
      this.queueStatsCache &&
      now - this.queueStatsCache.at < AdminService.QUEUE_STATS_TTL_MS
    ) {
      return this.queueStatsCache.data;
    }

    const entries: { name: string; queue: Queue }[] = [
      { name: QUEUES.INGESTION, queue: this.ingestionQueue },
      { name: QUEUES.ALERTS, queue: this.alertsQueue },
      { name: QUEUES.ANALYTICS, queue: this.analyticsQueue },
      { name: QUEUES.EXPIRY, queue: this.expiryQueue },
    ];

    return Promise.all(
      entries.map(async ({ name, queue }) => {
        const counts = await queue.getJobCounts(
          'active',
          'waiting',
          'completed',
          'failed',
        );

        return {
          name,
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
        };
      }),
    ).then((data) => {
      this.queueStatsCache = { data, at: Date.now() };
      return data;
    });
  }

  /** Paginated user list (safe shape — no passwords). */
  async users(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return {
      data: rows.map(toUserDto),
      meta: buildMeta(total, page, limit),
    };
  }
}
