// Partial update for an existing alert — all fields optional.
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AlertFrequency, JobType } from '@/generated/prisma';

export class UpdateAlertDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsEnum(AlertFrequency)
  frequency?: AlertFrequency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
