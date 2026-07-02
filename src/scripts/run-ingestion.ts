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

    process.stdout.write(`Ingestion complete: ${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`Ingestion failed: ${String(err)}\n`);
  process.exit(1);
});
