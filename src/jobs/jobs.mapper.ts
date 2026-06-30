// Maps Prisma Job entities to API DTOs (no DB access, no per-user flags).
import { Job } from '@/generated/prisma';
import { JobCardDto, JobDetailDto } from '@/jobs/dto/job-response.dto';

/** Job row from Prisma or Redis cache (dates may be ISO strings after JSON round-trip). */
type JobLike = Omit<
  Job,
  'postedAt' | 'applicationDeadline' | 'scrapedAt' | 'lastSeenAt' | 'updatedAt'
> & {
  postedAt: Date | string;
  applicationDeadline?: Date | string | null;
  scrapedAt?: Date | string;
};

/** Normalize a Date or ISO string to ISO string. */
function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.toISOString();
}

/**
 * Converts a Prisma Job row to JobCardDto without user-specific flags.
 * Caller injects isSaved/isApplied after mapping.
 */
export function toJobCardDto(
  job: JobLike,
  flags: { isSaved?: boolean; isApplied?: boolean } = {},
): JobCardDto {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyLogo: job.companyLogo,
    location: job.location,
    locationType: job.locationType,
    jobType: job.jobType,
    category: job.category,
    skills: job.skills,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryNegotiable: job.salaryNegotiable,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    source: job.source,
    sourceUrl: job.sourceUrl,
    postedAt: toIso(job.postedAt) ?? '',
    isActive: job.isActive,
    applicationDeadline: toIso(job.applicationDeadline),
    viewCount: job.viewCount,
    isSaved: flags.isSaved ?? false,
    isApplied: flags.isApplied ?? false,
  };
}

/**
 * Converts a Prisma Job row to JobDetailDto with market insight.
 */
export function toJobDetailDto(
  job: JobLike,
  marketInsight: JobDetailDto['marketInsight'],
  flags: { isSaved?: boolean; isApplied?: boolean } = {},
): JobDetailDto {
  return {
    ...toJobCardDto(job, flags),
    description: job.description,
    requirements: job.requirements,
    benefits: job.benefits,
    sourceName: job.sourceName,
    scrapedAt: toIso(job.scrapedAt) ?? '',
    marketInsight,
  };
}

/** Derives demand label from count of similar active jobs in the same category. */
export function demandLabelFromCount(count: number): 'Low' | 'Medium' | 'High' {
  if (count < 10) {
    return 'Low';
  }
  if (count <= 50) {
    return 'Medium';
  }
  return 'High';
}
