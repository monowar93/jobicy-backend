// Alert API response shape — mirrors 02-api-contracts.md §5.
import { AlertFrequency, JobType, LocationType } from '@/generated/prisma';

export interface AlertDto {
  id: string;
  keywords: string[];
  skills: string[];
  location: string | null;
  jobType: JobType | null;
  locationType: LocationType | null;
  frequency: AlertFrequency;
  isActive: boolean;
  createdAt: string;
}
