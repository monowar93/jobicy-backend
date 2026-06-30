// Alerts module — CRUD + job matching for ingestion and digest queues.
import { Module } from '@nestjs/common';
import { EmailModule } from '@/email/email.module';
import { AlertsController } from '@/alerts/alerts.controller';
import { AlertsService } from '@/alerts/alerts.service';

@Module({
  imports: [EmailModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
