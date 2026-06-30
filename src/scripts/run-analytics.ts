/**
 * Manual analytics snapshot runner — bootstraps Nest and runs nightly aggregation.
 * Usage: npm run analytics:snapshot
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { AnalyticsAggregatorService } from '@/analytics/analytics-aggregator.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const aggregator = app.get(AnalyticsAggregatorService);
    await aggregator.runDailySnapshot();
    // eslint-disable-next-line no-console -- CLI script output
    console.log('Analytics snapshot complete');
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- CLI script output
  console.error('Analytics snapshot failed:', err);
  process.exit(1);
});
