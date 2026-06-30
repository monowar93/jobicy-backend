// Analytics module — public read API + nightly aggregator.
import { Module } from '@nestjs/common';
import { AnalyticsController } from '@/analytics/analytics.controller';
import { AnalyticsService } from '@/analytics/analytics.service';
import { AnalyticsAggregatorService } from '@/analytics/analytics-aggregator.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsAggregatorService],
  exports: [AnalyticsService, AnalyticsAggregatorService],
})
export class AnalyticsModule {}
