// Query params for GET /api/jobs — filters, sort, pagination.
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  JobCategory,
  JobSource,
  JobType,
  LocationType,
} from '@/generated/prisma';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

/** Parse CSV query strings into arrays (e.g. ?skills=React,Node). */
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse enum CSV into typed arrays. */
function toEnumArray<T extends string>(
  value: unknown,
  enumObj: Record<string, T>,
): T[] | undefined {
  const arr = toStringArray(value);
  if (!arr?.length) {
    return undefined;
  }
  const valid = new Set(Object.values(enumObj));
  return arr.filter((v) => valid.has(v as T)) as T[];
}

export type JobSort = 'latest' | 'most_viewed' | 'salary_desc';
export type DatePostedFilter = 'today' | 'week' | 'month';
export type RegionFilter = 'bangladesh' | 'worldwide';

export class JobQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @Transform(({ value }) => toEnumArray(value, JobType))
  @IsArray()
  @IsEnum(JobType, { each: true })
  jobType?: JobType[];

  @IsOptional()
  @Transform(({ value }) => toEnumArray(value, JobCategory))
  @IsArray()
  @IsEnum(JobCategory, { each: true })
  category?: JobCategory[];

  @IsOptional()
  @Transform(({ value }) => toEnumArray(value, LocationType))
  @IsArray()
  @IsEnum(LocationType, { each: true })
  locationType?: LocationType[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  remoteOnly?: boolean;

  // Region toggle: "bangladesh" → BD jobs (any work type); "worldwide" →
  // jobs outside Bangladesh (which by ingestion policy are remote).
  @IsOptional()
  @IsIn(['bangladesh', 'worldwide'])
  region?: RegionFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  experienceMax?: number;

  @IsOptional()
  @Transform(({ value }) => toEnumArray(value, JobSource))
  @IsArray()
  @IsEnum(JobSource, { each: true })
  source?: JobSource[];

  @IsOptional()
  @IsIn(['today', 'week', 'month'])
  datePosted?: DatePostedFilter;

  @IsOptional()
  @IsIn(['latest', 'most_viewed', 'salary_desc'])
  sort?: JobSort = 'latest';
}
