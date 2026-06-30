// Analytics response shapes — mirror 02-api-contracts.md §6.
import { JobSource, SalaryCurrency } from '@/generated/prisma';

export interface OverviewDto {
  totalActiveJobs: number;
  newJobsToday: number;
  companiesHiringThisMonth: number;
  averageSalaryBdt: number;
  demandIndex: number;
  demandTrend: number;
}

export interface SkillTrendPointDto {
  date: string;
  count: number;
}

export interface SkillTrendSeriesDto {
  skill: string;
  points: SkillTrendPointDto[];
}

export interface SkillTrendsDto {
  range: '7d' | '30d';
  series: SkillTrendSeriesDto[];
}

export interface CompanyStatDto {
  company: string;
  logo: string | null;
  count: number;
}

export interface SalaryByRoleDto {
  role: string;
  min: number;
  avg: number;
  max: number;
  currency: SalaryCurrency;
}

export interface LocationStatDto {
  location: string;
  lat: number;
  lng: number;
  count: number;
}

export interface TimelinePointDto {
  date: string;
  total: number;
  bySource: Record<string, number>;
}

export interface SkillGrowthDto {
  skill: string;
  growth: number;
}

export interface DemandIndexDto {
  current: number;
  history: { date: string; value: number }[];
  risingSkills: SkillGrowthDto[];
  decliningSkills: SkillGrowthDto[];
}

/** JSON shapes stored in Analytics snapshot rows. */
export interface TopSkillSnapshot {
  skill: string;
  count: number;
  trend?: number;
}

export interface TopCompanySnapshot {
  company: string;
  count: number;
  logo?: string | null;
}

export interface TopLocationSnapshot {
  location: string;
  count: number;
}

export interface SalaryStatsSnapshot {
  average: number;
  median: number;
  byRole: { role: string; avg: number }[];
}

export interface JobTypeBreakdownSnapshot {
  remote: number;
  onsite: number;
  hybrid: number;
  fullTime: number;
  partTime: number;
  contract: number;
}

export interface CategoryBreakdownSnapshot {
  category: string;
  count: number;
}

/** Known Bangladesh city coordinates for the location map. */
export const BD_LOCATION_GEO: Record<string, { lat: number; lng: number }> = {
  dhaka: { lat: 23.8103, lng: 90.4125 },
  chattogram: { lat: 22.3569, lng: 91.7832 },
  sylhet: { lat: 24.8949, lng: 91.8687 },
  rajshahi: { lat: 24.3745, lng: 88.6042 },
  khulna: { lat: 22.8456, lng: 89.5403 },
  barishal: { lat: 22.701, lng: 90.3535 },
  rangpur: { lat: 25.7439, lng: 89.2752 },
  mymensingh: { lat: 24.7471, lng: 90.4203 },
  gazipur: { lat: 24.0023, lng: 90.4264 },
  narayanganj: { lat: 23.6238, lng: 90.4997 },
};

export function resolveLocationGeo(
  location: string,
): { lat: number; lng: number } {
  const lower = location.toLowerCase();
  for (const [key, coords] of Object.entries(BD_LOCATION_GEO)) {
    if (lower.includes(key)) {
      return coords;
    }
  }
  // Default to Dhaka centroid when city is unknown.
  return BD_LOCATION_GEO.dhaka;
}

export function sourceKey(source: JobSource): string {
  return source.toLowerCase();
}
