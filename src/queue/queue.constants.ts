// BullMQ queue names, job names, and cron expressions (Asia/Dhaka timezone).
export const QUEUES = {
  INGESTION: 'ingestion',
  ALERTS: 'alerts',
  ANALYTICS: 'analytics',
  EXPIRY: 'expiry',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Named job types enqueued onto each queue. */
export const JOBS = {
  INGESTION_RUN: 'ingestion-run',
  ALERTS_DAILY: 'alerts-daily',
  ALERTS_WEEKLY: 'alerts-weekly',
  ANALYTICS_SNAPSHOT: 'analytics-snapshot',
  EXPIRY_RUN: 'expiry-run',
} as const;

/** Cron schedules — interpreted in Asia/Dhaka by the scheduler. */
export const CRON = {
  /** Ingestion runs 4× daily at 10:00, 14:00, 19:00, 23:00 Dhaka time. */
  INGESTION: [
    '0 10 * * *',
    '0 14 * * *',
    '0 19 * * *',
    '0 23 * * *',
  ] as const,
  ANALYTICS: '0 0 * * *',
  DAILY_DIGEST: '0 9 * * *',
  WEEKLY_DIGEST: '0 9 * * 1',
  EXPIRY: '0 1 * * *',
} as const;

export const QUEUE_TIMEZONE = 'Asia/Dhaka';

/**
 * Shared BullMQ worker tuning — longer idle poll interval cuts Redis commands
 * when queues are empty (default drainDelay is 5 seconds).
 */
export const WORKER_IDLE_OPTIONS = {
  concurrency: 1,
  /** Seconds between idle polls — 120s cuts Redis usage vs default 5s (cron jobs tolerate ~2m delay). */
  drainDelay: 120,
} as const;
