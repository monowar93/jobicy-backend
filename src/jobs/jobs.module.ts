// Jobs module — read API, mapper export for saved/applied modules.
import { Module } from '@nestjs/common';
import { JobsController } from '@/jobs/jobs.controller';
import { JobsDetailController } from '@/jobs/jobs-detail.controller';
import { JobsService } from '@/jobs/jobs.service';

@Module({
  controllers: [JobsController, JobsDetailController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
