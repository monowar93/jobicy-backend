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
        const connection = redis.url
          ? { url: redis.url, maxRetriesPerRequest: null }
          : {
              host: redis.host,
              port: redis.port,
              password: redis.password,
              maxRetriesPerRequest: null,
              ...(redis.tls ? { tls: {} } : {}),
            };

        return {
          connection,
          // Azure Redis / Redis Cluster: hash tag keeps all BullMQ keys in one slot.
          prefix: '{bull}',
          defaultJobOptions: {
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 20 },
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
