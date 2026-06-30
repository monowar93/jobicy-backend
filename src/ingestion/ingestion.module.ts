// Ingestion module — source adapters, pipeline service, adapter registry.
import { Module } from '@nestjs/common';
import { JobsModule } from '@/jobs/jobs.module';
import {
  JOB_SOURCE_ADAPTERS,
  JobSourceAdapter,
} from '@/ingestion/adapters/job-source.adapter';
import { JsearchAdapter } from '@/ingestion/adapters/jsearch.adapter';
import { ActiveJobsDbAdapter } from '@/ingestion/adapters/active-jobs-db.adapter';
import { JobicyAdapter } from '@/ingestion/adapters/jobicy.adapter';
import { IndeedAdapter } from '@/ingestion/adapters/indeed.adapter';
import { RemoteJobsAdapter } from '@/ingestion/adapters/remote-jobs.adapter';
import { GlassdoorAdapter } from '@/ingestion/adapters/glassdoor.adapter';
import { IngestionService } from '@/ingestion/ingestion.service';
import { RealtimeModule } from '@/realtime/realtime.module';

@Module({
  imports: [JobsModule, RealtimeModule],
  providers: [
    JsearchAdapter,
    ActiveJobsDbAdapter,
    JobicyAdapter,
    IndeedAdapter,
    RemoteJobsAdapter,
    GlassdoorAdapter,
    IngestionService,
    {
      provide: JOB_SOURCE_ADAPTERS,
      useFactory: (
        jsearch: JsearchAdapter,
        activeJobsDb: ActiveJobsDbAdapter,
        jobicy: JobicyAdapter,
        indeed: IndeedAdapter,
        remoteJobs: RemoteJobsAdapter,
        glassdoor: GlassdoorAdapter,
      ): JobSourceAdapter[] => [
        jsearch,
        activeJobsDb,
        jobicy,
        indeed,
        remoteJobs,
        glassdoor,
      ],
      inject: [
        JsearchAdapter,
        ActiveJobsDbAdapter,
        JobicyAdapter,
        IndeedAdapter,
        RemoteJobsAdapter,
        GlassdoorAdapter,
      ],
    },
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
