// BullMQ module — registers queues, processors, and cron scheduler.
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertsModule } from '@/alerts/alerts.module';
import { AnalyticsModule } from '@/analytics/analytics.module';
import { AppConfig } from '@/config/configuration';
import { EmailModule } from '@/email/email.module';
import { IngestionModule } from '@/ingestion/ingestion.module';
import { MaintenanceModule } from '@/maintenance/maintenance.module';
import { QUEUES } from '@/queue/queue.constants';
import { QueueScheduler } from '@/queue/queue.scheduler';
import { IngestionProcessor } from '@/queue/processors/ingestion.processor';
import { AlertsProcessor } from '@/queue/processors/alerts.processor';
import { AnalyticsProcessor } from '@/queue/processors/analytics.processor';
import { ExpiryProcessor } from '@/queue/processors/expiry.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redis = config.get('redis', { infer: true });
        if (redis.url) {
          return { connection: { url: redis.url } };
        }
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            ...(redis.tls ? { tls: {} } : {}),
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.INGESTION },
      { name: QUEUES.ALERTS },
      { name: QUEUES.ANALYTICS },
      { name: QUEUES.EXPIRY },
    ),
    IngestionModule,
    AlertsModule,
    EmailModule,
    AnalyticsModule,
    MaintenanceModule,
  ],
  providers: [
    QueueScheduler,
    IngestionProcessor,
    AlertsProcessor,
    AnalyticsProcessor,
    ExpiryProcessor,
  ],
  exports: [BullModule],
})
export class QueueModule {}
