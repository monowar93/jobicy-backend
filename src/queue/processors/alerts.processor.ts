// Alerts digest processor — daily 09:00 and weekly Monday 09:00 (Asia/Dhaka).
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AlertFrequency } from '@/generated/prisma';
import { AlertsService } from '@/alerts/alerts.service';
import { EmailService } from '@/email/email.service';
import { PrismaService } from '@/prisma/prisma.service';
import { JOBS, QUEUES, WORKER_IDLE_OPTIONS } from '@/queue/queue.constants';

@Processor(QUEUES.ALERTS, WORKER_IDLE_OPTIONS)
export class AlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsProcessor.name);

  constructor(
    private readonly alertsService: AlertsService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOBS.ALERTS_DAILY) {
      await this.runDigest('DAILY', 'daily');
      return;
    }
    if (job.name === JOBS.ALERTS_WEEKLY) {
      await this.runDigest('WEEKLY', 'weekly');
      return;
    }
    this.logger.warn(`Unknown alerts job name: ${job.name}`);
  }

  /** Finds matching jobs since `since` and sends a digest email per alert. */
  private async runDigest(
    frequency: 'DAILY' | 'WEEKLY',
    label: 'daily' | 'weekly',
  ): Promise<void> {
    const freq =
      frequency === 'DAILY' ? AlertFrequency.DAILY : AlertFrequency.WEEKLY;
    const alerts = await this.alertsService.getDigestAlerts(freq);
    this.logger.log(`Running ${label} digest for ${alerts.length} alert(s)`);

    for (const alert of alerts) {
      const since =
        alert.lastSentAt ??
        new Date(Date.now() - (label === 'weekly' ? 7 : 1) * 24 * 60 * 60 * 1000);

      const jobs = await this.alertsService.findMatchingJobsSince(alert, since);
      if (jobs.length === 0) {
        continue;
      }

      const emailJobs = jobs.map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        sourceUrl: j.sourceUrl,
      }));

      if (label === 'daily') {
        await this.emailService.sendDailyDigest(alert.user.email, emailJobs);
      } else {
        await this.emailService.sendWeeklyDigest(alert.user.email, emailJobs);
      }

      await this.prisma.alert.update({
        where: { id: alert.id },
        data: { lastSentAt: new Date() },
      });
    }
  }
}
