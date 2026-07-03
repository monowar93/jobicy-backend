// Jobs business logic — query building, caching, view counts, similar/trending.
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Job, JobCategory, LocationType, Prisma } from '@/generated/prisma';
import { appError } from '@/common/constants/error-codes';
import { buildMeta } from '@/common/utils/pagination.util';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService, TTL } from '@/redis/redis.service';
import { JobQueryDto } from '@/jobs/dto/job-query.dto';
import { JobCardDto, JobDetailDto } from '@/jobs/dto/job-response.dto';
import {
  demandLabelFromCount,
  toJobCardDto,
  toJobDetailDto,
} from '@/jobs/jobs.mapper';

/** Cached job list payload (without per-user flags). */
interface CachedJobList {
  jobs: Job[];
  total: number;
}

/** Cached job detail payload (without per-user flags or market insight). */
interface CachedJobBase {
  job: Job;
  similarActiveCount: number;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Paginated job list with filters, sort, Redis cache, and optional user flags.
   */
  async findAll(
    query: JobQueryDto,
    userId?: string,
  ): Promise<{ data: JobCardDto[]; meta: ReturnType<typeof buildMeta> }> {
    const cacheKey = await this.versionedJobsKey(this.buildCacheKey('jobs', query));

    const cached = await this.redis.wrap<CachedJobList>(
      cacheKey,
      TTL.JOBS,
      async () => {
        const where = this.buildWhere(query);
        const orderBy = this.buildOrderBy(query.sort ?? 'latest');
        const skip = (query.page - 1) * query.limit;

        const [jobs, total] = await Promise.all([
          this.prisma.job.findMany({ where, orderBy, skip, take: query.limit }),
          this.prisma.job.count({ where }),
        ]);

        return { jobs, total };
      },
    );

    const flags = await this.getUserFlags(
      userId,
      cached.jobs.map((j) => j.id),
    );

    const data = cached.jobs.map((job) =>
      toJobCardDto(job, {
        isSaved: flags.saved.has(job.id),
        isApplied: flags.applied.has(job.id),
      }),
    );

    return {
      data,
      meta: buildMeta(cached.total, query.page, query.limit),
    };
  }

  /**
   * Single job detail — increments viewCount, returns market insight + user flags.
   */
  async findOne(id: string, userId?: string): Promise<JobDetailDto> {
    const cacheKey = await this.versionedJobsKey(`detail:${id}`);

    const cached = await this.redis.wrap<CachedJobBase>(
      cacheKey,
      TTL.JOB,
      async () => {
        const job = await this.prisma.job.findUnique({ where: { id } });
        if (!job) {
          throw appError('JOB_NOT_FOUND');
        }

        const similarActiveCount = await this.prisma.job.count({
          where: { isActive: true, category: job.category },
        });

        return { job, similarActiveCount };
      },
    );

    // Increment view count and use the fresh value (cache excludes live viewCount).
    const updated = await this.prisma.job.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    const flags = await this.getUserFlags(userId, [id]);
    const marketInsight = {
      similarActiveCount: cached.similarActiveCount,
      demandLabel: demandLabelFromCount(cached.similarActiveCount),
    };

    return toJobDetailDto(
      { ...cached.job, viewCount: updated.viewCount },
      marketInsight,
      {
        isSaved: flags.saved.has(id),
        isApplied: flags.applied.has(id),
      },
    );
  }

  /**
   * Full-text search across title, company, description, and skills.
   */
  async search(
    q: string,
    page: number,
    limit: number,
    userId?: string,
  ): Promise<{ data: JobCardDto[]; meta: ReturnType<typeof buildMeta> }> {
    const cacheKey = await this.versionedJobsKey(
      this.buildCacheKey('jobs:search', { q, page, limit }),
    );

    const cached = await this.redis.wrap<CachedJobList>(
      cacheKey,
      TTL.JOBS,
      async () => {
        const where: Prisma.JobWhereInput = {
          isActive: true,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { skills: { has: q } },
          ],
        };
        const skip = (page - 1) * limit;

        const [jobs, total] = await Promise.all([
          this.prisma.job.findMany({
            where,
            orderBy: { postedAt: 'desc' },
            skip,
            take: limit,
          }),
          this.prisma.job.count({ where }),
        ]);

        return { jobs, total };
      },
    );

    const flags = await this.getUserFlags(
      userId,
      cached.jobs.map((j) => j.id),
    );

    const data = cached.jobs.map((job) =>
      toJobCardDto(job, {
        isSaved: flags.saved.has(job.id),
        isApplied: flags.applied.has(job.id),
      }),
    );

    return { data, meta: buildMeta(cached.total, page, limit) };
  }

  /** Top jobs today by recency and view count (max 10). */
  async trending(userId?: string): Promise<JobCardDto[]> {
    const todayStart = this.startOfDay(new Date());

    const jobs = await this.prisma.job.findMany({
      where: { isActive: true, postedAt: { gte: todayStart } },
      orderBy: [{ viewCount: 'desc' }, { postedAt: 'desc' }],
      take: 10,
    });

    // Fallback: if fewer than 10 posted today, fill with most-viewed active jobs.
    if (jobs.length < 10) {
      const existingIds = new Set(jobs.map((j) => j.id));
      const more = await this.prisma.job.findMany({
        where: { isActive: true, id: { notIn: [...existingIds] } },
        orderBy: { viewCount: 'desc' },
        take: 10 - jobs.length,
      });
      jobs.push(...more);
    }

    const flags = await this.getUserFlags(
      userId,
      jobs.map((j) => j.id),
    );

    return jobs.map((job) =>
      toJobCardDto(job, {
        isSaved: flags.saved.has(job.id),
        isApplied: flags.applied.has(job.id),
      }),
    );
  }

  /** Similar jobs by category + skill overlap (max 6 by default). */
  async similar(
    id: string,
    limit: number,
    userId?: string,
  ): Promise<JobCardDto[]> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw appError('JOB_NOT_FOUND');
    }

    const where: Prisma.JobWhereInput = {
      isActive: true,
      category: job.category,
      id: { not: id },
    };
    if (job.skills.length > 0) {
      where.skills = { hasSome: job.skills };
    }

    const candidates = await this.prisma.job.findMany({
      where,
      take: limit * 3,
    });

    // Rank by skill overlap count, then recency.
    const ranked = candidates
      .map((c) => ({
        job: c,
        overlap: c.skills.filter((s) => job.skills.includes(s)).length,
      }))
      .sort((a, b) => {
        const aTime =
          typeof a.job.postedAt === 'string'
            ? new Date(a.job.postedAt).getTime()
            : a.job.postedAt.getTime();
        const bTime =
          typeof b.job.postedAt === 'string'
            ? new Date(b.job.postedAt).getTime()
            : b.job.postedAt.getTime();
        return b.overlap - a.overlap || bTime - aTime;
      })
      .slice(0, limit)
      .map((r) => r.job);

    const flags = await this.getUserFlags(
      userId,
      ranked.map((j) => j.id),
    );

    return ranked.map((j) =>
      toJobCardDto(j, {
        isSaved: flags.saved.has(j.id),
        isApplied: flags.applied.has(j.id),
      }),
    );
  }

  /** Verify a job exists; throws JOB_NOT_FOUND when missing. */
  async assertJobExists(jobId: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw appError('JOB_NOT_FOUND');
    }
    return job;
  }

  /** Build Prisma where clause from filter DTO. */
  private buildWhere(query: JobQueryDto): Prisma.JobWhereInput {
    const where: Prisma.JobWhereInput = { isActive: true };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { company: { contains: query.q, mode: 'insensitive' } },
        { skills: { has: query.q } },
      ];
    }

    if (query.skills?.length) {
      where.skills = { hasSome: query.skills };
    }

    if (query.location) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }

    if (query.jobType?.length) {
      where.jobType = { in: query.jobType };
    }

    if (query.category?.length) {
      // DevOps filter also returns QA roles (QA is hidden as its own filter option).
      const categories = [...query.category];
      if (
        categories.includes(JobCategory.DEVOPS) &&
        !categories.includes(JobCategory.QA)
      ) {
        categories.push(JobCategory.QA);
      }
      where.category = { in: categories };
    }

    if (query.locationType?.length) {
      where.locationType = { in: query.locationType };
    }

    if (query.remoteOnly) {
      where.locationType = LocationType.REMOTE;
    }

    // Region toggle (Bangladesh vs Worldwide). Combine with locationType above
    // to express e.g. "Bangladesh + Remote" or "Worldwide + Remote".
    if (query.region === 'bangladesh') {
      where.isBangladesh = true;
    } else if (query.region === 'worldwide') {
      where.isBangladesh = false;
    }

    if (query.salaryMin !== undefined) {
      where.salaryMax = { gte: query.salaryMin };
    }

    if (query.salaryMax !== undefined) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { salaryMin: { lte: query.salaryMax } },
            { salaryNegotiable: true },
          ],
        },
      ];
    }

    if (query.experienceMax !== undefined) {
      where.experienceMin = { lte: query.experienceMax };
    }

    if (query.source?.length) {
      where.source = { in: query.source };
    }

    if (query.datePosted) {
      where.postedAt = { gte: this.datePostedCutoff(query.datePosted) };
    }

    return where;
  }

  /** Map sort option to Prisma orderBy. */
  private buildOrderBy(sort: string): Prisma.JobOrderByWithRelationInput[] {
    switch (sort) {
      case 'most_viewed':
        return [{ viewCount: 'desc' }, { postedAt: 'desc' }];
      case 'salary_desc':
        return [
          { salaryMax: { sort: 'desc', nulls: 'last' } },
          { postedAt: 'desc' },
        ];
      case 'latest':
      default:
        return [{ postedAt: 'desc' }];
    }
  }

  /** Cutoff date for datePosted filter. */
  private datePostedCutoff(filter: 'today' | 'week' | 'month'): Date {
    const now = new Date();
    switch (filter) {
      case 'today':
        return this.startOfDay(now);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Stable cache key from normalized query object. */
  private buildCacheKey(prefix: string, query: unknown): string {
    const hash = createHash('sha256')
      .update(JSON.stringify(query))
      .digest('hex')
      .slice(0, 16);
    return `${prefix}:${hash}`;
  }

  /** Prefix a jobs cache key with the current invalidation generation. */
  private async versionedJobsKey(suffix: string): Promise<string> {
    const gen = await this.redis.getCacheGeneration('jobs');
    return `jobs:v${gen}:${suffix}`;
  }

  /** Batch-fetch isSaved/isApplied sets for a list of job IDs. */
  private async getUserFlags(
    userId: string | undefined,
    jobIds: string[],
  ): Promise<{ saved: Set<string>; applied: Set<string> }> {
    const saved = new Set<string>();
    const applied = new Set<string>();

    if (!userId || jobIds.length === 0) {
      return { saved, applied };
    }

    const [savedRows, appliedRows] = await Promise.all([
      this.prisma.savedJob.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true },
      }),
      this.prisma.application.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true },
      }),
    ]);

    for (const row of savedRows) {
      saved.add(row.jobId);
    }
    for (const row of appliedRows) {
      applied.add(row.jobId);
    }

    return { saved, applied };
  }
}
