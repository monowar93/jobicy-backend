// Alerts business logic — CRUD, job matching, instant + digest helpers.
import { Injectable, Logger } from '@nestjs/common';
import {
  Alert,
  AlertFrequency,
  Job,
  Prisma,
} from '@/generated/prisma';
import { appError } from '@/common/constants/error-codes';
import { normalizeSkill } from '@/common/utils/normalize.util';
import { PrismaService } from '@/prisma/prisma.service';
import { EmailService } from '@/email/email.service';
import { CreateAlertDto } from '@/alerts/dto/create-alert.dto';
import { UpdateAlertDto } from '@/alerts/dto/update-alert.dto';
import { AlertDto } from '@/alerts/dto/alert-response.dto';

/** Alert row with owner email — used by digest processors. */
export type AlertWithUser = Alert & { user: { email: string; name: string } };

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /** Lists all alerts owned by the user. */
  async list(userId: string): Promise<AlertDto[]> {
    const rows = await this.prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  /** Creates a new alert for the authenticated user. */
  async create(userId: string, dto: CreateAlertDto): Promise<AlertDto> {
    const row = await this.prisma.alert.create({
      data: {
        userId,
        keywords: dto.keywords.map((k) => k.trim()).filter(Boolean),
        skills: dto.skills.map((s) => normalizeSkill(s)).filter(Boolean),
        location: dto.location?.trim() || null,
        jobType: dto.jobType ?? null,
        locationType: dto.locationType ?? null,
        frequency: dto.frequency,
        isActive: dto.isActive ?? true,
      },
    });
    return this.toDto(row);
  }

  /** Updates an alert — owner-only. */
  async update(
    userId: string,
    id: string,
    dto: UpdateAlertDto,
  ): Promise<AlertDto> {
    const existing = await this.findOwnedOrThrow(userId, id);

    const row = await this.prisma.alert.update({
      where: { id: existing.id },
      data: {
        ...(dto.keywords !== undefined && {
          keywords: dto.keywords.map((k) => k.trim()).filter(Boolean),
        }),
        ...(dto.skills !== undefined && {
          skills: dto.skills.map((s) => normalizeSkill(s)).filter(Boolean),
        }),
        ...(dto.location !== undefined && {
          location: dto.location?.trim() || null,
        }),
        ...(dto.jobType !== undefined && { jobType: dto.jobType ?? null }),
        ...(dto.locationType !== undefined && {
          locationType: dto.locationType ?? null,
        }),
        ...(dto.frequency !== undefined && { frequency: dto.frequency }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return this.toDto(row);
  }

  /** Deletes an alert — owner-only. */
  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    await this.findOwnedOrThrow(userId, id);
    await this.prisma.alert.delete({ where: { id } });
    return { deleted: true };
  }

  /** Sends a test email with current matches and returns the match count. */
  async test(userId: string, id: string): Promise<{ matched: number }> {
    const alert = await this.findOwnedOrThrow(userId, id);
    const where = this.buildAlertWhere(alert);
    const jobs = await this.prisma.job.findMany({
      where,
      take: 10,
      orderBy: { postedAt: 'desc' },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (jobs.length > 0) {
      await this.emailService.sendInstantAlert(
        user.email,
        jobs.map((j) => this.toEmailJob(j)),
        { keywords: alert.keywords, skills: alert.skills },
      );
    }

    return { matched: jobs.length };
  }

  /** Counts jobs posted in the last 7 days matching this alert. */
  async preview(
    userId: string,
    id: string,
  ): Promise<{ matchedThisWeek: number }> {
    const alert = await this.findOwnedOrThrow(userId, id);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const where: Prisma.JobWhereInput = {
      ...this.buildAlertWhere(alert),
      postedAt: { gte: weekAgo },
    };
    const matchedThisWeek = await this.prisma.job.count({ where });
    return { matchedThisWeek };
  }

  /**
   * Called by IngestionService for each new job — sends instant emails for
   * matching active INSTANT alerts.
   */
  async matchJobToAlerts(job: Job): Promise<void> {
    const alerts = await this.prisma.alert.findMany({
      where: { isActive: true, frequency: AlertFrequency.INSTANT },
      include: { user: { select: { email: true, name: true } } },
    });

    for (const alert of alerts) {
      if (!this.jobMatchesAlert(job, alert)) {
        continue;
      }

      // Throttle: skip if we already sent this alert in the last hour.
      if (
        alert.lastSentAt &&
        Date.now() - alert.lastSentAt.getTime() < 60 * 60 * 1000
      ) {
        continue;
      }

      await this.emailService.sendInstantAlert(
        alert.user.email,
        [this.toEmailJob(job)],
        { keywords: alert.keywords, skills: alert.skills },
      );

      await this.prisma.alert.update({
        where: { id: alert.id },
        data: { lastSentAt: new Date() },
      });

      this.logger.log(
        `Instant alert sent alertId=${alert.id} jobId=${job.id}`,
      );
    }
  }

  /** Returns active alerts for daily/weekly digest processors. */
  async getDigestAlerts(frequency: AlertFrequency): Promise<AlertWithUser[]> {
    return this.prisma.alert.findMany({
      where: { isActive: true, frequency },
      include: { user: { select: { email: true, name: true } } },
    });
  }

  /**
   * Finds jobs matching an alert since `since` — used by digest processors.
   */
  async findMatchingJobsSince(
    alert: Alert,
    since: Date,
  ): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: {
        ...this.buildAlertWhere(alert),
        postedAt: { gte: since },
      },
      orderBy: { postedAt: 'desc' },
      take: 50,
    });
  }

  /** Translates alert criteria into a Prisma JobWhereInput for queries. */
  buildAlertWhere(alert: Alert): Prisma.JobWhereInput {
    const and: Prisma.JobWhereInput[] = [{ isActive: true }];

    if (alert.keywords.length > 0) {
      and.push({
        OR: alert.keywords.flatMap((kw) => [
          { title: { contains: kw, mode: 'insensitive' } },
          { company: { contains: kw, mode: 'insensitive' } },
          { description: { contains: kw, mode: 'insensitive' } },
        ]),
      });
    }

    if (alert.skills.length > 0) {
      and.push({ skills: { hasSome: alert.skills } });
    }

    if (alert.location) {
      and.push({
        location: { contains: alert.location, mode: 'insensitive' },
      });
    }

    if (alert.jobType) {
      and.push({ jobType: alert.jobType });
    }

    if (alert.locationType) {
      and.push({ locationType: alert.locationType });
    }

    return { AND: and };
  }

  /** In-memory check whether a single job satisfies alert criteria. */
  private jobMatchesAlert(job: Job, alert: Alert): boolean {
    if (!alert.isActive) {
      return false;
    }

    if (alert.keywords.length > 0) {
      const hit = alert.keywords.some((kw) => {
        const lower = kw.toLowerCase();
        return (
          job.title.toLowerCase().includes(lower) ||
          job.company.toLowerCase().includes(lower) ||
          job.description.toLowerCase().includes(lower)
        );
      });
      if (!hit) {
        return false;
      }
    }

    if (alert.skills.length > 0) {
      const hit = alert.skills.some((s) => job.skills.includes(s));
      if (!hit) {
        return false;
      }
    }

    if (alert.location) {
      const loc = alert.location.toLowerCase();
      if (!job.location.toLowerCase().includes(loc)) {
        return false;
      }
    }

    if (alert.jobType && job.jobType !== alert.jobType) {
      return false;
    }

    if (alert.locationType && job.locationType !== alert.locationType) {
      return false;
    }

    return true;
  }

  private async findOwnedOrThrow(userId: string, id: string): Promise<Alert> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      throw appError('ALERT_NOT_FOUND');
    }
    if (alert.userId !== userId) {
      throw appError('FORBIDDEN');
    }
    return alert;
  }

  private toDto(row: Alert): AlertDto {
    return {
      id: row.id,
      keywords: row.keywords,
      skills: row.skills,
      location: row.location,
      jobType: row.jobType,
      locationType: row.locationType,
      frequency: row.frequency,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toEmailJob(job: Job) {
    return {
      title: job.title,
      company: job.company,
      location: job.location,
      sourceUrl: job.sourceUrl,
    };
  }
}
