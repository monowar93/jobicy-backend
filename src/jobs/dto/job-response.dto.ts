// Job card and detail response shapes — mirror 02-api-contracts.md §2.
import {
  JobCategory,
  JobSource,
  JobType,
  LocationType,
  SalaryCurrency,
} from '@/generated/prisma';

/** Compact job shape used in lists, cards, and nested saved/applied responses. */
export interface JobCardDto {
  id: string;
  title: string;
  company: string;
  companyLogo: string | null;
  location: string;
  locationType: LocationType;
  isBangladesh: boolean;
  jobType: JobType;
  category: JobCategory;
  skills: string[];
  benefits: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: SalaryCurrency | null;
  salaryNegotiable: boolean;
  experienceMin: number | null;
  experienceMax: number | null;
  source: JobSource;
  sourceName: string | null;
  sourceUrl: string;
  postedAt: string;
  isActive: boolean;
  applicationDeadline: string | null;
  viewCount: number;
  isSaved: boolean;
  isApplied: boolean;
}

/** Full job detail with description, requirements, and market insight. */
export interface JobDetailDto extends JobCardDto {
  description: string;
  requirements: string[];
  benefits: string[];
  sourceName: string | null;
  scrapedAt: string;
  companyWebsite: string | null;
  companyLinkedIn: string | null;
  marketInsight: {
    similarActiveCount: number;
    demandLabel: 'Low' | 'Medium' | 'High';
  };
}

/** Saved job row with nested card. */
export interface SavedJobDto {
  savedAt: string;
  note: string | null;
  job: JobCardDto;
}

/** Applied job row with nested card. */
export interface AppliedJobDto {
  appliedAt: string;
  job: JobCardDto;
}
