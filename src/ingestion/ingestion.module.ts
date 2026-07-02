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
import { JsearchApiAdapter } from '@/ingestion/adapters/jsearch-api.adapter';
import { IngestionService } from '@/ingestion/ingestion.service';
import { JobEnrichmentService } from '@/ingestion/job-enrichment.service';
import { RealtimeModule } from '@/realtime/realtime.module';
import { AlertsModule } from '@/alerts/alerts.module';

@Module({
  imports: [JobsModule, RealtimeModule, AlertsModule],
  providers: [
    JsearchAdapter,
    ActiveJobsDbAdapter,
    JobicyAdapter,
    IndeedAdapter,
    RemoteJobsAdapter,
    GlassdoorAdapter,
    JsearchApiAdapter,
    IngestionService,
    JobEnrichmentService,
    {
      provide: JOB_SOURCE_ADAPTERS,
      useFactory: (
        jsearch: JsearchAdapter,
        activeJobsDb: ActiveJobsDbAdapter,
        jobicy: JobicyAdapter,
        indeed: IndeedAdapter,
        remoteJobs: RemoteJobsAdapter,
        glassdoor: GlassdoorAdapter,
        jsearchApi: JsearchApiAdapter,
      ): JobSourceAdapter[] => [
        jsearch,
        activeJobsDb,
        jobicy,
        indeed,
        remoteJobs,
        glassdoor,
        jsearchApi,
      ],
      inject: [
        JsearchAdapter,
        ActiveJobsDbAdapter,
        JobicyAdapter,
        IndeedAdapter,
        RemoteJobsAdapter,
        GlassdoorAdapter,
        JsearchApiAdapter,
      ],
    },
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
