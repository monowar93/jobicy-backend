// Orchestrates fetch → normalize → dedup → upsert → cache bust → realtime emit.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job, FetchStatus, LocationType } from '@/generated/prisma';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { isBangladeshLocation } from '@/common/utils/normalize.util';
import { toJobCardDto } from '@/jobs/jobs.mapper';
import {
  INGESTIBLE_CATEGORIES,
  JOB_SOURCE_ADAPTERS,
  JobSourceAdapter,
  NormalizedJobInput,
} from '@/ingestion/adapters/job-source.adapter';
import { RealtimeService } from '@/realtime/realtime.service';
import { AlertsService } from '@/alerts/alerts.service';
import { JobEnrichmentService } from '@/ingestion/job-enrichment.service';

/** Summary returned after a successful ingestion run. */
export interface IngestionRunResult {
  jobsFetched: number;
  jobsNew: number;
  jobsDuplicate: number;
  durationMs: number;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly alertsService: AlertsService,
    private readonly jobEnrichment: JobEnrichmentService,
    @Inject(JOB_SOURCE_ADAPTERS)
    private readonly adapters: JobSourceAdapter[],
  ) {}

  /**
   * Full ingestion pipeline for every registered adapter.
   * Writes FetchLog, upserts jobs by fingerprint, busts cache, emits socket events.
   */
  async run(): Promise<IngestionRunResult> {
    let totalFetched = 0;
    let totalNew = 0;
    let totalDuplicate = 0;
    const allNewJobs: Job[] = [];
    const runStarted = Date.now();

    // Run every source independently — one provider failing must not block the rest.
    for (const adapter of this.adapters) {
      try {
        const adapterResult = await this.runAdapter(adapter);
        totalFetched += adapterResult.jobsFetched;
        totalNew += adapterResult.jobsNew;
        totalDuplicate += adapterResult.jobsDuplicate;
        allNewJobs.push(...adapterResult.newJobs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Adapter [${adapter.source}] skipped after failure: ${message}`,
        );
        // FetchLog already recorded FAILED in runAdapter; continue with next source.
      }
    }

    // Bust job list/detail caches after any ingestion activity.
    const generation = await this.redis.invalidateCache('jobs');
    this.logger.log(`Invalidated jobs cache (generation ${generation})`);

    if (allNewJobs.length > 0) {
      const cards = allNewJobs.map((job) => toJobCardDto(job));
      this.realtime.emitNewJobs(cards);
      const stats = await this.computeLiveStats();
      this.realtime.emitStats(stats);

      // Instant alert emails for each newly ingested job.
      for (const job of allNewJobs) {
        await this.alertsService.matchJobToAlerts(job);
      }
    }

    return {
      jobsFetched: totalFetched,
      jobsNew: totalNew,
      jobsDuplicate: totalDuplicate,
      durationMs: Date.now() - runStarted,
    };
  }

  /** Runs ingestion for a single adapter with its own FetchLog row. */
  private async runAdapter(
    adapter: JobSourceAdapter,
  ): Promise<{
    jobsFetched: number;
    jobsNew: number;
    jobsDuplicate: number;
    newJobs: Job[];
  }> {
    const startedAt = Date.now();
    const fetchLog = await this.prisma.fetchLog.create({
      data: {
        source: adapter.source,
        status: FetchStatus.RUNNING,
      },
    });

    try {
      const rawJobs = await adapter.fetchJobs({});
      const normalized = await this.prepareNormalizedJobs(rawJobs, adapter);
      const { jobsNew, jobsDuplicate, newJobs } =
        await this.upsertJobs(normalized);

      await this.prisma.fetchLog.update({
        where: { id: fetchLog.id },
        data: {
          status: FetchStatus.SUCCESS,
          jobsFetched: rawJobs.length,
          jobsNew,
          jobsDuplicate,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
        },
      });

      this.logger.log(
        `Ingestion [${adapter.source}]: fetched=${rawJobs.length} new=${jobsNew} dup=${jobsDuplicate}`,
      );

      return {
        jobsFetched: rawJobs.length,
        jobsNew,
        jobsDuplicate,
        newJobs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Ingestion [${adapter.source}] failed: ${message}`);

      await this.prisma.fetchLog.update({
        where: { id: fetchLog.id },
        data: {
          status: FetchStatus.FAILED,
          errors: [message],
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
        },
      });

      throw err;
    }
  }

  /**
   * Normalize, filter non-developer roles, and dedupe within the batch by fingerprint.
   */
  private async prepareNormalizedJobs(
    rawJobs: Record<string, unknown>[],
    adapter: JobSourceAdapter,
  ): Promise<NormalizedJobInput[]> {
    const seen = new Set<string>();
    const result: NormalizedJobInput[] = [];

    for (const raw of rawJobs) {
      const normalized = adapter.normalize(raw);

      if (!normalized.title || !normalized.sourceUrl) {
        continue;
      }

      // Fill sparse skills / empty benefits from description (description text unchanged).
      await this.jobEnrichment.enrich(normalized);

      // Drop non-developer postings (marketing, HR, etc.).
      if (!INGESTIBLE_CATEGORIES.has(normalized.category)) {
        continue;
      }

      // Geography policy: keep ALL Bangladesh jobs (onsite/hybrid/remote) but
      // only REMOTE jobs from outside Bangladesh (worldwide remote). Drop
      // onsite/hybrid jobs located outside Bangladesh.
      const isBangladesh = isBangladeshLocation(normalized.location);
      if (!isBangladesh && normalized.locationType !== LocationType.REMOTE) {
        continue;
      }
      normalized.isBangladesh = isBangladesh;

      if (seen.has(normalized.fingerprint)) {
        continue;
      }
      seen.add(normalized.fingerprint);
      result.push(normalized);
    }

    return result;
  }

  /**
   * Upsert each job by fingerprint — new rows are created, existing rows refresh lastSeenAt.
   */
  private async upsertJobs(jobs: NormalizedJobInput[]): Promise<{
    jobsNew: number;
    jobsDuplicate: number;
    newJobs: Job[];
  }> {
    let jobsNew = 0;
    let jobsDuplicate = 0;
    const newJobs: Job[] = [];
    const now = new Date();

    for (const job of jobs) {
      const existing = await this.prisma.job.findUnique({
        where: { fingerprint: job.fingerprint },
      });

      if (existing) {
        jobsDuplicate += 1;
        const skillPatch =
          job.skills.length > existing.skills.length
            ? { skills: job.skills, category: job.category }
            : {};
        const benefitPatch =
          existing.benefits.length === 0 && job.benefits.length > 0
            ? { benefits: job.benefits }
            : {};

        await this.prisma.job.update({
          where: { fingerprint: job.fingerprint },
          data: {
            lastSeenAt: now,
            fetchCount: { increment: 1 },
            isActive: true,
            isBangladesh: job.isBangladesh ?? false,
            ...(job.companyWebsite ? { companyWebsite: job.companyWebsite } : {}),
            ...(job.companyLinkedIn ? { companyLinkedIn: job.companyLinkedIn } : {}),
            ...skillPatch,
            ...benefitPatch,
          },
        });
      } else {
        jobsNew += 1;
        const created = await this.prisma.job.create({
          data: {
            fingerprint: job.fingerprint,
            title: job.title,
            company: job.company,
            companyLogo: job.companyLogo,
            companyWebsite: job.companyWebsite ?? null,
            companyLinkedIn: job.companyLinkedIn ?? null,
            location: job.location,
            locationType: job.locationType,
            isBangladesh: job.isBangladesh ?? false,
            jobType: job.jobType,
            category: job.category,
            skills: job.skills,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            salaryCurrency: job.salaryCurrency,
            salaryNegotiable: job.salaryNegotiable,
            experienceMin: job.experienceMin,
            experienceMax: job.experienceMax,
            description: job.description,
            requirements: job.requirements,
            benefits: job.benefits,
            applicationDeadline: job.applicationDeadline,
            postedAt: job.postedAt,
            source: job.source,
            sourceName: job.sourceName,
            sourceUrl: job.sourceUrl,
            scrapedAt: now,
            lastSeenAt: now,
          },
        });
        newJobs.push(created);
      }
    }

    return { jobsNew, jobsDuplicate, newJobs };
  }

  /** Counts active jobs and jobs scraped today for stats:update socket event. */
  private async computeLiveStats(): Promise<{
    totalActiveJobs: number;
    newJobsToday: number;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalActiveJobs, newJobsToday] = await Promise.all([
      this.prisma.job.count({ where: { isActive: true } }),
      this.prisma.job.count({
        where: { scrapedAt: { gte: todayStart } },
      }),
    ]);

    return { totalActiveJobs, newJobsToday };
  }
}
