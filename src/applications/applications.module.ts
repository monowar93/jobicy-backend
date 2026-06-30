// Applications module — apply/unapply tracker under /api/jobs.
import { Module } from '@nestjs/common';
import { ApplicationsController } from '@/applications/applications.controller';
import { ApplicationsService } from '@/applications/applications.service';

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
