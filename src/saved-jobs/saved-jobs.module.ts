// Saved jobs module — save/unsave/list/export under /api/jobs.
import { Module } from '@nestjs/common';
import { SavedJobsController } from '@/saved-jobs/saved-jobs.controller';
import { SavedJobsService } from '@/saved-jobs/saved-jobs.service';

@Module({
  controllers: [SavedJobsController],
  providers: [SavedJobsService],
})
export class SavedJobsModule {}
