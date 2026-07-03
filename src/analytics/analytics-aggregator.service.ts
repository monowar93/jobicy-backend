// Nightly analytics snapshot computation — writes Analytics rows + busts cache.
import { Injectable, Logger } from '@nestjs/common';
import {
  JobCategory,
  JobType,
  LocationType,
  Prisma,
  SalaryCurrency,
} from '@/generated/prisma';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import {
  CategoryBreakdownSnapshot,
  JobTypeBreakdownSnapshot,
  SalaryStatsSnapshot,
  TopCompanySnapshot,
  TopLocationSnapshot,
  TopSkillSnapshot,
} from '@/analytics/dto/analytics-response.dto';

@Injectable()
export class AnalyticsAggregatorService {
  private readonly logger = new Logger(AnalyticsAggregatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Computes and upserts today's analytics snapshot, then clears analytics cache.
   * Called nightly by the analytics BullMQ processor.
   */
  async runDailySnapshot(): Promise<void> {
    const todayStart = this.startOfDay(new Date());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const [totalJobs, newJobs, activeJobs] = await Promise.all([
      this.prisma.job.count(),
      this.prisma.job.count({
        where: { scrapedAt: { gte: todayStart } },
      }),
      this.prisma.job.findMany({
        where: { isActive: true },
        select: {
          skills: true,
          company: true,
          companyLogo: true,
          location: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          locationType: true,
          jobType: true,
          category: true,
        },
      }),
    ]);

    const topSkills = this.aggregateSkills(activeJobs);
    const topCompanies = this.aggregateCompanies(activeJobs);
    const topLocations = this.aggregateLocations(activeJobs);
    const salaryStats = this.aggregateSalaries(activeJobs);
    const jobTypeBreakdown = this.aggregateJobTypes(activeJobs);
    const categoryBreakdown = this.aggregateCategories(activeJobs);

    const yesterday = await this.prisma.analytics.findUnique({
      where: { date: yesterdayStart },
    });

    const priorNewJobs = yesterday?.newJobs ?? 0;
    const growthRate =
      priorNewJobs > 0 ? newJobs / priorNewJobs : newJobs > 0 ? 1.5 : 1;
    const demandIndex = Math.min(
      100,
      Math.max(
        0,
        (newJobs / Math.max(totalJobs, 1)) * growthRate * 100,
      ),
    );

    // Enrich top skills with trend vs yesterday snapshot.
    const priorSkills = (yesterday?.topSkills as TopSkillSnapshot[] | null) ?? [];
    const priorMap = new Map(priorSkills.map((s) => [s.skill, s.count]));
    const enrichedSkills: TopSkillSnapshot[] = topSkills.map((s) => {
      const prev = priorMap.get(s.skill) ?? 0;
      const trend = prev > 0 ? ((s.count - prev) / prev) * 100 : s.count > 0 ? 100 : 0;
      return { ...s, trend: Math.round(trend * 10) / 10 };
    });

    await this.prisma.analytics.upsert({
      where: { date: todayStart },
      create: {
        date: todayStart,
        totalJobs: activeJobs.length,
        newJobs,
        topSkills: enrichedSkills as unknown as Prisma.InputJsonValue,
        topCompanies: topCompanies as unknown as Prisma.InputJsonValue,
        topLocations: topLocations as unknown as Prisma.InputJsonValue,
        salaryStats: salaryStats as unknown as Prisma.InputJsonValue,
        jobTypeBreakdown: jobTypeBreakdown as unknown as Prisma.InputJsonValue,
        categoryBreakdown: categoryBreakdown as unknown as Prisma.InputJsonValue,
        demandIndex,
      },
      update: {
        totalJobs: activeJobs.length,
        newJobs,
        topSkills: enrichedSkills as unknown as Prisma.InputJsonValue,
        topCompanies: topCompanies as unknown as Prisma.InputJsonValue,
        topLocations: topLocations as unknown as Prisma.InputJsonValue,
        salaryStats: salaryStats as unknown as Prisma.InputJsonValue,
        jobTypeBreakdown: jobTypeBreakdown as unknown as Prisma.InputJsonValue,
        categoryBreakdown: categoryBreakdown as unknown as Prisma.InputJsonValue,
        demandIndex,
      },
    });

    await this.redis.invalidateCache('analytics');
    this.logger.log(
      `Analytics snapshot saved date=${todayStart.toISOString()} demandIndex=${demandIndex}`,
    );
  }

  private aggregateSkills(
    jobs: { skills: string[] }[],
  ): TopSkillSnapshot[] {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      for (const skill of job.skills) {
        counts.set(skill, (counts.get(skill) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
  }

  private aggregateCompanies(
    jobs: { company: string; companyLogo: string | null }[],
  ): TopCompanySnapshot[] {
    const counts = new Map<string, { count: number; logo: string | null }>();
    for (const job of jobs) {
      const existing = counts.get(job.company);
      if (existing) {
        existing.count += 1;
        if (!existing.logo && job.companyLogo) {
          existing.logo = job.companyLogo;
        }
      } else {
        counts.set(job.company, { count: 1, logo: job.companyLogo });
      }
    }
    return [...counts.entries()]
      .map(([company, { count, logo }]) => ({ company, count, logo }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  private aggregateLocations(
    jobs: { location: string }[],
  ): TopLocationSnapshot[] {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      counts.set(job.location, (counts.get(job.location) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  private aggregateSalaries(
    jobs: {
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: SalaryCurrency | null;
      category: JobCategory;
    }[],
  ): SalaryStatsSnapshot {
    const bdtValues: number[] = [];
    const byRoleMap = new Map<string, number[]>();

    for (const job of jobs) {
      const val = job.salaryMax ?? job.salaryMin;
      if (val === null) {
        continue;
      }
      // Normalize to BDT for snapshot average (USD × 120).
      const bdt =
        job.salaryCurrency === SalaryCurrency.USD ? val * 120 : val;
      bdtValues.push(bdt);

      const role = job.category;
      const arr = byRoleMap.get(role) ?? [];
      arr.push(bdt);
      byRoleMap.set(role, arr);
    }

    bdtValues.sort((a, b) => a - b);
    const average =
      bdtValues.length > 0
        ? Math.round(
            bdtValues.reduce((s, v) => s + v, 0) / bdtValues.length,
          )
        : 0;
    const median =
      bdtValues.length > 0
        ? bdtValues[Math.floor(bdtValues.length / 2)]
        : 0;

    const byRole = [...byRoleMap.entries()].map(([role, vals]) => ({
      role,
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    }));

    return { average, median, byRole };
  }

  private aggregateJobTypes(
    jobs: { locationType: LocationType; jobType: JobType }[],
  ): JobTypeBreakdownSnapshot {
    const breakdown: JobTypeBreakdownSnapshot = {
      remote: 0,
      onsite: 0,
      hybrid: 0,
      fullTime: 0,
      partTime: 0,
      contract: 0,
    };

    for (const job of jobs) {
      if (job.locationType === LocationType.REMOTE) breakdown.remote += 1;
      if (job.locationType === LocationType.ONSITE) breakdown.onsite += 1;
      if (job.locationType === LocationType.HYBRID) breakdown.hybrid += 1;
      if (job.jobType === JobType.FULL_TIME) breakdown.fullTime += 1;
      if (job.jobType === JobType.PART_TIME) breakdown.partTime += 1;
      if (job.jobType === JobType.CONTRACT) breakdown.contract += 1;
    }

    return breakdown;
  }

  private aggregateCategories(
    jobs: { category: JobCategory }[],
  ): CategoryBreakdownSnapshot[] {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      counts.set(job.category, (counts.get(job.category) ?? 0) + 1);
    }
    return [...counts.entries()].map(([category, count]) => ({
      category,
      count,
    }));
  }

  private startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
}
