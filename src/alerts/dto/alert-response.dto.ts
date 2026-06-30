// Alert API response shape — mirrors 02-api-contracts.md §5.
import { AlertFrequency, JobType } from '@/generated/prisma';

export interface AlertDto {
  id: string;
  keywords: string[];
  skills: string[];
  location: string | null;
  jobType: JobType | null;
  salaryMin: number | null;
  frequency: AlertFrequency;
  isActive: boolean;
  createdAt: string;
}
