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
    process.stdout.write('Analytics snapshot complete\n');
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`Analytics snapshot failed: ${String(err)}\n`);
  process.exit(1);
});
