// Analytics query params — range, skills filter, currency, experience.
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SalaryCurrency } from '@/generated/prisma';

export class AnalyticsRangeQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d'])
  range?: '7d' | '30d' = '7d';
}

export class SkillsTrendQueryDto extends AnalyticsRangeQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value as string[];
    }
    if (typeof value === 'string' && value.length > 0) {
      return value.split(',').map((s) => s.trim());
    }
    return undefined;
  })
  @IsString({ each: true })
  skills?: string[];
}

export class CompaniesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class SalariesQueryDto {
  @IsOptional()
  @IsEnum(SalaryCurrency)
  currency?: SalaryCurrency = SalaryCurrency.BDT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  experience?: number;
}
