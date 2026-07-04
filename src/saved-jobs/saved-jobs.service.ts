// Saved jobs business logic — save, unsave, list, note update, CSV export.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma';
import { appError } from '@/common/constants/error-codes';
import { PrismaService } from '@/prisma/prisma.service';
import { toJobCardDto } from '@/jobs/jobs.mapper';
import { SavedJobDto } from '@/jobs/dto/job-response.dto';

@Injectable()
export class SavedJobsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Save a job for the user; 409 if already saved. */
  async save(
    userId: string,
    jobId: string,
    note?: string,
  ): Promise<{ saved: true }> {
    await this.assertJobExists(jobId);

    try {
      await this.prisma.savedJob.create({
        data: { userId, jobId, note: note ?? null },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw appError('ALREADY_SAVED');
      }
      throw err;
    }

    return { saved: true };
  }

  /** Update the personal note on a saved job. */
  async updateNote(
    userId: string,
    jobId: string,
    note: string,
  ): Promise<{ saved: true }> {
    const existing = await this.prisma.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });

    if (!existing) {
      throw appError('JOB_NOT_FOUND', 'Saved job not found');
    }

    await this.prisma.savedJob.update({
      where: { userId_jobId: { userId, jobId } },
      data: { note },
    });

    return { saved: true };
  }

  /** Remove a saved job (idempotent). */
  async unsave(userId: string, jobId: string): Promise<{ saved: false }> {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
    return { saved: false };
  }

  /** List all saved jobs for the user with nested job cards. */
  async list(userId: string, sort?: string): Promise<SavedJobDto[]> {
    const orderBy = this.resolveSort(sort);

    const rows = await this.prisma.savedJob.findMany({
      where: { userId },
      include: { job: true },
      orderBy,
    });

    const jobIds = rows.map((row) => row.jobId);
    const appliedRows =
      jobIds.length > 0
        ? await this.prisma.application.findMany({
            where: { userId, jobId: { in: jobIds } },
            select: { jobId: true },
          })
        : [];
    const appliedSet = new Set(appliedRows.map((r) => r.jobId));

    return rows.map((row) => ({
      savedAt: row.createdAt.toISOString(),
      note: row.note,
      job: toJobCardDto(row.job, {
        isSaved: true,
        isApplied: appliedSet.has(row.jobId),
      }),
    }));
  }

  /** Build CSV string of saved jobs for download. */
  async exportCsv(userId: string): Promise<string> {
    const rows = await this.list(userId);

    const header = 'Title,Company,Location,Salary Min,Salary Max,Source URL,Saved At,Note';
    const lines = rows.map((row) => {
      const j = row.job;
      const cols = [
        this.csvEscape(j.title),
        this.csvEscape(j.company),
        this.csvEscape(j.location),
        j.salaryMin ?? '',
        j.salaryMax ?? '',
        this.csvEscape(j.sourceUrl),
        row.savedAt,
        this.csvEscape(row.note ?? ''),
      ];
      return cols.join(',');
    });

    return [header, ...lines].join('\n');
  }

  /** Map sort query to Prisma orderBy. */
  private resolveSort(
    sort?: string,
  ): Prisma.SavedJobOrderByWithRelationInput {
    switch (sort) {
      case 'title':
        return { job: { title: 'asc' } };
      case 'company':
        return { job: { company: 'asc' } };
      case 'oldest':
        return { createdAt: 'asc' };
      case 'latest':
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }

  /** Escape a CSV field (wrap in quotes when needed). */
  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
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
