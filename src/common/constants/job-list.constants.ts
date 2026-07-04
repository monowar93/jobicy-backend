// Shared definition of jobs shown on the public board and home-page counter.
import { JobCategory, Prisma } from '@/generated/prisma';

/** Developer categories eligible for the public jobs board (matches ingestion policy). */
export const LISTABLE_JOB_CATEGORIES: readonly JobCategory[] = [
  JobCategory.FULLSTACK,
  JobCategory.BACKEND,
  JobCategory.FRONTEND,
  JobCategory.SOFTWARE_ENGINEER,
  JobCategory.MOBILE,
  JobCategory.DEVOPS,
  JobCategory.QA,
];

/** Base Prisma filter for active, listable developer jobs. */
export function listableJobsWhere(
  extra: Prisma.JobWhereInput = {},
): Prisma.JobWhereInput {
  return {
    isActive: true,
    category: { in: [...LISTABLE_JOB_CATEGORIES] },
    ...extra,
  };
}
