/**
 * Stale-job cleanup runner — bootstraps Nest context and purges old jobs.
 * Schedule this daily (Windows Task Scheduler / Linux cron) to cap DB storage.
 * Usage: npm run jobs:cleanup
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { MaintenanceService } from '@/maintenance/maintenance.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const maintenance = app.get(MaintenanceService);
    const result = await maintenance.purgeOldJobs();

    process.stdout.write(`Cleanup complete: ${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`Cleanup failed: ${String(err)}\n`);
  process.exit(1);
});
