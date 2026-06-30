// Email delivery — Nodemailer transport + Handlebars templates.
import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppConfig } from '@/config/configuration';
import { JobCardDto } from '@/jobs/dto/job-response.dto';

/** Minimal alert context for email templates (avoids circular import with alerts module). */
export interface AlertEmailContext {
  keywords: string[];
  skills: string[];
}

/** Minimal job row passed into alert email templates. */
export interface AlertEmailJob {
  title: string;
  company: string;
  location: string;
  sourceUrl: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transport!: Transporter;
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();
  private mailFrom = '';
  private frontendOrigin = '';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /** Lazily creates the SMTP transport and compiles Handlebars templates. */
  onModuleInit(): void {
    const mail = this.config.get('mail', { infer: true });
    this.mailFrom = mail.from;
    this.frontendOrigin = this.config.get('frontendOrigin', { infer: true });

    this.transport = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: { user: mail.user, pass: mail.pass },
    });

    for (const name of [
      'verify-email',
      'reset-password',
      'alert-instant',
      'alert-daily',
      'alert-weekly',
    ]) {
      this.templates.set(name, this.compileTemplate(name));
    }
  }

  /** Sends the email-verification link after registration. */
  async sendVerifyEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Verify your Jobicy account',
      'verify-email',
      { link, appName: 'Jobicy' },
    );
  }

  /** Sends the password-reset link. */
  async sendResetPassword(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Reset your Jobicy password',
      'reset-password',
      { link, appName: 'Jobicy' },
    );
  }

  /** Instant alert when a new job matches user criteria. */
  async sendInstantAlert(
    to: string,
    jobs: AlertEmailJob[],
    alert: Pick<AlertEmailContext, 'keywords' | 'skills'>,
  ): Promise<void> {
    await this.send(to, `${jobs.length} new job(s) match your alert`, 'alert-instant', {
      jobs,
      alert,
      manageUrl: `${this.frontendOrigin}/alerts`,
      appName: 'Jobicy',
    });
  }

  /** Daily digest of {jobs} for an alert. */
  async sendDailyDigest(to: string, jobs: AlertEmailJob[]): Promise<void> {
    await this.send(
      to,
      `Your daily job digest (${jobs.length})`,
      'alert-daily',
      { jobs, manageUrl: `${this.frontendOrigin}/alerts`, appName: 'Jobicy' },
    );
  }

  /** Weekly digest {jobs} for an alert. */
  async sendWeeklyDigest(to: string, jobs: AlertEmailJob[]): Promise<void> {
    await this.send(
      to,
      `Your weekly job digest (${jobs.length})`,
      'alert-weekly',
      { jobs, manageUrl: `${this.frontendOrigin}/alerts`, appName: 'Jobicy' },
    );
  }

  /** Maps JobCardDto rows to the slim shape used in email templates. */
  toAlertEmailJobs(jobs: JobCardDto[]): AlertEmailJob[] {
    return jobs.map((j) => ({
      title: j.title,
      company: j.company,
      location: j.location,
      sourceUrl: j.sourceUrl,
    }));
  }

  /** Renders a template and sends via SMTP; logs errors without crashing callers. */
  private async send(
    to: string,
    subject: string,
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const template = this.templates.get(templateName);
    if (!template) {
      this.logger.error(`Missing email template: ${templateName}`);
      return;
    }

    try {
      const html = template(context);
      await this.transport.sendMail({
        from: this.mailFrom,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent [${templateName}] to=${to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Email failed [${templateName}] to=${to}: ${message}`);
    }
  }

  /** Loads and compiles a Handlebars template from disk. */
  private compileTemplate(name: string): Handlebars.TemplateDelegate {
    const filePath = join(__dirname, 'templates', `${name}.hbs`);
    const source = readFileSync(filePath, 'utf-8');
    return Handlebars.compile(source);
  }
}
