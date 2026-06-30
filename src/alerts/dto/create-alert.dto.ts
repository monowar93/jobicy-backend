// Create alert request body — mirrors 02-api-contracts.md §5.
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

export class CreateAlertDto {
  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @IsArray()
  @IsString({ each: true })
  skills!: string[];

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

  @IsEnum(AlertFrequency)
  frequency!: AlertFrequency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
