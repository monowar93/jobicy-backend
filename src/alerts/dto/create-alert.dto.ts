// Create alert request body — mirrors 02-api-contracts.md §5.
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { AlertFrequency, JobType, LocationType } from '@/generated/prisma';

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
  @IsEnum(LocationType)
  locationType?: LocationType;

  @IsEnum(AlertFrequency)
  frequency!: AlertFrequency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
