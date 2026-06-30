// Analytics read API — snapshot + live fallback, Redis-cached 1h.
import { Injectable } from '@nestjs/common';
import { SalaryCurrency } from '@/generated/prisma';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService, TTL } from '@/redis/redis.service';
import {
  CompaniesQueryDto,
  SalariesQueryDto,
  SkillsTrendQueryDto,
  AnalyticsRangeQueryDto,
} from '@/analytics/dto/analytics-query.dto';
import {
  CompanyStatDto,
  DemandIndexDto,
  LocationStatDto,
  OverviewDto,
  resolveLocationGeo,
  SalaryByRoleDto,
  SalaryStatsSnapshot,
  SkillTrendsDto,
  sourceKey,
  TimelinePointDto,
  TopCompanySnapshot,
  TopLocationSnapshot,
  TopSkillSnapshot,
} from '@/analytics/dto/analytics-response.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Platform overview cards — live counts + latest snapshot demand index. */
  async getOverview(): Promise<OverviewDto> {
    return this.redis.wrap('analytics:overview', TTL.ANALYTICS, async () => {
      const todayStart = this.startOfDay(new Date());
      const monthStart = new Date(todayStart);
      monthStart.setDate(1);

      const [totalActiveJobs, newJobsToday, companiesHiringThisMonth, latest, yesterday] =
        await Promise.all([
          this.prisma.job.count({ where: { isActive: true } }),
          this.prisma.job.count({
            where: { scrapedAt: { gte: todayStart } },
          }),
          this.prisma.job.groupBy({
            by: ['company'],
            where: { postedAt: { gte: monthStart }, isActive: true },
          }).then((rows) => rows.length),
          this.prisma.analytics.findFirst({ orderBy: { date: 'desc' } }),
          this.prisma.analytics.findFirst({
            where: { date: { lt: todayStart } },
            orderBy: { date: 'desc' },
          }),
        ]);

      const salaryStats = (latest?.salaryStats as unknown as SalaryStatsSnapshot | null) ?? {
        average: 0,
        median: 0,
        byRole: [],
      };

      const demandIndex = latest?.demandIndex ?? 0;
      const priorDemand = yesterday?.demandIndex ?? demandIndex;
      const demandTrend = Math.round((demandIndex - priorDemand) * 10) / 10;

      return {
        totalActiveJobs,
        newJobsToday,
        companiesHiringThisMonth,
        averageSalaryBdt: salaryStats.average,
        demandIndex,
        demandTrend,
      };
    });
  }

  /** Per-skill time series built from daily snapshots over the requested range. */
  async getSkillTrends(query: SkillsTrendQueryDto): Promise<SkillTrendsDto> {
    const range = query.range ?? '7d';
    const skills = (query.skills ?? []).slice(0, 5);
    const cacheKey = `analytics:skills:${range}:${skills.join(',')}`;

    return this.redis.wrap(cacheKey, TTL.ANALYTICS, async () => {
      const days = range === '30d' ? 30 : 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const snapshots = await this.prisma.analytics.findMany({
        where: { date: { gte: since } },
        orderBy: { date: 'asc' },
      });

      const targetSkills =
        skills.length > 0
          ? skills
          : this.topSkillsFromSnapshots(snapshots).slice(0, 5);

      const series = targetSkills.map((skill) => ({
        skill,
        points: snapshots.map((snap) => {
          const top = (snap.topSkills as unknown as TopSkillSnapshot[]) ?? [];
          const row = top.find((t) => t.skill === skill);
          return {
            date: snap.date.toISOString().slice(0, 10),
            count: row?.count ?? 0,
          };
        }),
      }));

      return { range, series };
    });
  }

  /** Top hiring companies from the latest snapshot (live groupBy fallback). */
  async getCompanies(query: CompaniesQueryDto): Promise<CompanyStatDto[]> {
    const limit = query.limit ?? 10;
    const cacheKey = `analytics:companies:${limit}`;

    return this.redis.wrap(cacheKey, TTL.ANALYTICS, async () => {
      const latest = await this.prisma.analytics.findFirst({
        orderBy: { date: 'desc' },
      });

      if (latest) {
        const top = (latest.topCompanies as unknown as TopCompanySnapshot[]) ?? [];
        return top.slice(0, limit).map((c) => ({
          company: c.company,
          logo: c.logo ?? null,
          count: c.count,
        }));
      }

      // Live fallback when no snapshot exists yet.
      const grouped = await this.prisma.job.groupBy({
        by: ['company', 'companyLogo'],
        where: { isActive: true },
        _count: { company: true },
        orderBy: { _count: { company: 'desc' } },
        take: limit,
      });

      return grouped.map((g) => ({
        company: g.company,
        logo: g.companyLogo,
        count: g._count.company,
      }));
    });
  }

  /** Salary min/avg/max by developer role category. */
  async getSalaries(query: SalariesQueryDto): Promise<SalaryByRoleDto[]> {
    const currency = query.currency ?? SalaryCurrency.BDT;
    const experience = query.experience;
    const cacheKey = `analytics:salaries:${currency}:${experience ?? 'all'}`;

    return this.redis.wrap(cacheKey, TTL.ANALYTICS, async () => {
      const where = {
        isActive: true,
        salaryCurrency: currency,
        ...(experience !== undefined && {
          OR: [
            { experienceMax: { gte: experience } },
            { experienceMin: { lte: experience } },
          ],
        }),
      };

      const jobs = await this.prisma.job.findMany({
        where,
        select: {
          category: true,
          salaryMin: true,
          salaryMax: true,
        },
      });

      const byRole = new Map<
        string,
        { min: number; max: number; sum: number; count: number }
      >();

      for (const job of jobs) {
        const min = job.salaryMin ?? job.salaryMax;
        const max = job.salaryMax ?? job.salaryMin;
        if (min === null && max === null) {
          continue;
        }
        const lo = min ?? max!;
        const hi = max ?? min!;
        const entry = byRole.get(job.category) ?? {
          min: lo,
          max: hi,
          sum: 0,
          count: 0,
        };
        entry.min = Math.min(entry.min, lo);
        entry.max = Math.max(entry.max, hi);
        entry.sum += (lo + hi) / 2;
        entry.count += 1;
        byRole.set(job.category, entry);
      }

      return [...byRole.entries()].map(([role, stats]) => ({
        role,
        min: stats.min,
        avg: Math.round(stats.sum / stats.count),
        max: stats.max,
        currency,
      }));
    });
  }

  /** Job counts by Bangladesh location with map coordinates. */
  async getLocations(): Promise<LocationStatDto[]> {
    return this.redis.wrap('analytics:locations', TTL.ANALYTICS, async () => {
      const latest = await this.prisma.analytics.findFirst({
        orderBy: { date: 'desc' },
      });

      const locations: TopLocationSnapshot[] = latest
        ? ((latest.topLocations as unknown as TopLocationSnapshot[]) ?? [])
        : await this.liveTopLocations();

      return locations.map((loc) => {
        const geo = resolveLocationGeo(loc.location);
        return {
          location: loc.location,
          lat: geo.lat,
          lng: geo.lng,
          count: loc.count,
        };
      });
    });
  }

  /** Daily job posting timeline with per-source breakdown. */
  async getTimeline(query: AnalyticsRangeQueryDto): Promise<TimelinePointDto[]> {
    const range = query.range ?? '7d';
    const cacheKey = `analytics:timeline:${range}`;

    return this.redis.wrap(cacheKey, TTL.ANALYTICS, async () => {
      const days = range === '30d' ? 30 : 7;
      const since = new Date();
      since.setDate(since.getDate() - days);
      since.setHours(0, 0, 0, 0);

      const jobs = await this.prisma.job.findMany({
        where: { postedAt: { gte: since } },
        select: { postedAt: true, source: true },
      });

      const byDate = new Map<string, { total: number; bySource: Record<string, number> }>();

      for (const job of jobs) {
        const date = job.postedAt.toISOString().slice(0, 10);
        const entry = byDate.get(date) ?? { total: 0, bySource: {} };
        entry.total += 1;
        const key = sourceKey(job.source);
        entry.bySource[key] = (entry.bySource[key] ?? 0) + 1;
        byDate.set(date, entry);
      }

      return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stats]) => ({
          date,
          total: stats.total,
          bySource: stats.bySource,
        }));
    });
  }

  /** Demand index gauge with history and rising/declining skills. */
  async getDemandIndex(): Promise<DemandIndexDto> {
    return this.redis.wrap('analytics:demand-index', TTL.ANALYTICS, async () => {
      const snapshots = await this.prisma.analytics.findMany({
        orderBy: { date: 'desc' },
        take: 14,
      });

      const latest = snapshots[0];
      const current = latest?.demandIndex ?? 0;
      const history = [...snapshots]
        .reverse()
        .map((s) => ({
          date: s.date.toISOString().slice(0, 10),
          value: s.demandIndex,
        }));

      const topSkills = (latest?.topSkills as unknown as TopSkillSnapshot[]) ?? [];
      const priorSkills = (snapshots[1]?.topSkills as unknown as TopSkillSnapshot[]) ?? [];
      const priorMap = new Map(priorSkills.map((s) => [s.skill, s.count]));

      const growthList = topSkills.map((s) => {
        const prev = priorMap.get(s.skill) ?? 0;
        const growth =
          prev > 0
            ? Math.round(((s.count - prev) / prev) * 1000) / 10
            : s.count > 0
              ? 100
              : 0;
        return { skill: s.skill, growth };
      });

      growthList.sort((a, b) => b.growth - a.growth);
      const risingSkills = growthList.filter((g) => g.growth > 0).slice(0, 10);
      const decliningSkills = [...growthList]
        .filter((g) => g.growth < 0)
        .sort((a, b) => a.growth - b.growth)
        .slice(0, 10);

      return { current, history, risingSkills, decliningSkills };
    });
  }

  private topSkillsFromSnapshots(
    snapshots: { topSkills: unknown }[],
  ): string[] {
    const counts = new Map<string, number>();
    for (const snap of snapshots) {
      const top = (snap.topSkills as unknown as TopSkillSnapshot[]) ?? [];
      for (const row of top) {
        counts.set(row.skill, (counts.get(row.skill) ?? 0) + row.count);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([skill]) => skill);
  }

  private async liveTopLocations(): Promise<TopLocationSnapshot[]> {
    const grouped = await this.prisma.job.groupBy({
      by: ['location'],
      where: { isActive: true, isBangladesh: true },
      _count: { location: true },
      orderBy: { _count: { location: 'desc' } },
      take: 20,
    });
    return grouped.map((g) => ({
      location: g.location,
      count: g._count.location,
    }));
  }

  private startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
}
