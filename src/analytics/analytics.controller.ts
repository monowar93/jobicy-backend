// Public analytics read routes — Redis-cached per 02-api-contracts.md §6.
import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';
import {
  AnalyticsRangeQueryDto,
  CompaniesQueryDto,
  SalariesQueryDto,
  SkillsTrendQueryDto,
} from '@/analytics/dto/analytics-query.dto';
import { AnalyticsService } from '@/analytics/analytics.service';

@Controller('analytics')
@Public()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  overview() {
    return this.analyticsService.getOverview();
  }

  @Get('skills')
  skills(@Query() query: SkillsTrendQueryDto) {
    return this.analyticsService.getSkillTrends(query);
  }

  @Get('companies')
  companies(@Query() query: CompaniesQueryDto) {
    return this.analyticsService.getCompanies(query);
  }

  @Get('salaries')
  salaries(@Query() query: SalariesQueryDto) {
    return this.analyticsService.getSalaries(query);
  }

  @Get('locations')
  locations() {
    return this.analyticsService.getLocations();
  }

  @Get('timeline')
  timeline(@Query() query: AnalyticsRangeQueryDto) {
    return this.analyticsService.getTimeline(query);
  }

  @Get('demand-index')
  demandIndex() {
    return this.analyticsService.getDemandIndex();
  }
}
