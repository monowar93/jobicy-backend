/**
 * Manual ingestion runner — bootstraps Nest context and calls IngestionService.run().
 * Usage: npm run ingestion:run
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { IngestionService } from '@/ingestion/ingestion.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const ingestion = app.get(IngestionService);
    const result = await ingestion.run();

    // eslint-disable-next-line no-console -- CLI script output
    console.log('Ingestion complete:', result);
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- CLI script output
  console.error('Ingestion failed:', err);
  process.exit(1);
});
