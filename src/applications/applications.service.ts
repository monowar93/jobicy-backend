// Applications business logic — apply/unapply tracker and flag helpers.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma';
import { appError } from '@/common/constants/error-codes';
import { PrismaService } from '@/prisma/prisma.service';
import { toJobCardDto } from '@/jobs/jobs.mapper';
import { AppliedJobDto } from '@/jobs/dto/job-response.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Record that the user applied to a job; 409 if already applied. */
  async apply(
    userId: string,
    jobId: string,
  ): Promise<{ applied: true; appliedAt: string }> {
    await this.assertJobExists(jobId);

    try {
      const row = await this.prisma.application.create({
        data: { userId, jobId },
      });
      return { applied: true, appliedAt: row.appliedAt.toISOString() };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw appError('ALREADY_APPLIED');
      }
      throw err;
    }
  }

  /** Remove an application record (idempotent). */
  async unapply(userId: string, jobId: string): Promise<{ applied: false }> {
    await this.prisma.application.deleteMany({ where: { userId, jobId } });
    return { applied: false };
  }

  /** List all jobs the user has marked as applied. */
  async listApplied(userId: string): Promise<AppliedJobDto[]> {
    const rows = await this.prisma.application.findMany({
      where: { userId },
      include: { job: true },
      orderBy: { appliedAt: 'desc' },
    });

    const jobIds = rows.map((row) => row.jobId);
    const savedRows =
      jobIds.length > 0
        ? await this.prisma.savedJob.findMany({
            where: { userId, jobId: { in: jobIds } },
            select: { jobId: true },
          })
        : [];
    const savedSet = new Set(savedRows.map((r) => r.jobId));

    return rows.map((row) => ({
      appliedAt: row.appliedAt.toISOString(),
      job: toJobCardDto(row.job, {
        isSaved: savedSet.has(row.jobId),
        isApplied: true,
      }),
    }));
  }

  /**
   * Batch lookup of applied job IDs — used by JobsService for isApplied flags.
   */
  async isAppliedMap(
    userId: string,
    jobIds: string[],
  ): Promise<Set<string>> {
    if (jobIds.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.application.findMany({
      where: { userId, jobId: { in: jobIds } },
      select: { jobId: true },
    });

    return new Set(rows.map((r) => r.jobId));
  }

  /** Throws JOB_NOT_FOUND when the job id does not exist. */
  private async assertJobExists(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) {
      throw appError('JOB_NOT_FOUND');
    }
  }
}
