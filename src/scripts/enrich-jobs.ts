/**
 * Backfill skills/benefits on existing jobs from stored descriptions.
 * Usage: npm run jobs:enrich
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { JobEnrichmentService } from '@/ingestion/job-enrichment.service';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import {
  MIN_DESCRIPTION_FOR_EXTRACT,
  shouldEnrichSkills,
} from '@/common/utils/description-extract.util';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const enrichment = app.get(JobEnrichmentService);
    const redis = app.get(RedisService);

    const candidates = await prisma.job.findMany({
      where: {
        description: { not: '' },
      },
      select: {
        id: true,
        title: true,
        description: true,
        skills: true,
        benefits: true,
        category: true,
      },
    });

    let updated = 0;
    let skipped = 0;

    for (const job of candidates) {
      const needsSkills = shouldEnrichSkills(job.skills.length);
      const needsBenefits = job.benefits.length === 0;
      const descOk = job.description.trim().length >= MIN_DESCRIPTION_FOR_EXTRACT;

      if (!descOk || (!needsSkills && !needsBenefits)) {
        skipped += 1;
        continue;
      }

      const enriched = await enrichment.enrichFields({
        title: job.title,
        description: job.description,
        skills: job.skills,
        benefits: job.benefits,
        category: job.category,
      });

      const skillsChanged =
        enriched.skills.length > job.skills.length ||
        enriched.skills.some((s, i) => s !== job.skills[i]);
      const benefitsChanged =
        job.benefits.length === 0 && enriched.benefits.length > 0;
      const categoryChanged = enriched.category !== job.category;

      if (!skillsChanged && !benefitsChanged && !categoryChanged) {
        skipped += 1;
        continue;
      }

      await prisma.job.update({
        where: { id: job.id },
        data: {
          skills: enriched.skills,
          ...(benefitsChanged ? { benefits: enriched.benefits } : {}),
          ...(categoryChanged ? { category: enriched.category } : {}),
        },
      });
      updated += 1;
    }

    if (updated > 0) {
      await redis.delByPattern('jobs:*');
    }

    process.stdout.write(
      `Enrichment backfill complete: updated=${updated} skipped=${skipped} scanned=${candidates.length}\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`Enrichment backfill failed: ${String(err)}\n`);
  process.exit(1);
});
