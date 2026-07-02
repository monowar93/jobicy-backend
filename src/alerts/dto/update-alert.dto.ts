// Partial update for an existing alert — all fields optional.
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { AlertFrequency, JobType, LocationType } from '@/generated/prisma';

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
  @IsEnum(LocationType)
  locationType?: LocationType;

  @IsOptional()
  @IsEnum(AlertFrequency)
  frequency?: AlertFrequency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
