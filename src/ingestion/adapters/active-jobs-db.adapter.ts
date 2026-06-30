// Active Jobs DB adapter (RapidAPI host: active-jobs-db.p.rapidapi.com).
//
// Aggregates postings from many ATS providers and returns the same schema as the
// LinkedIn feed (the "Fantastic Jobs" family), so it reuses the shared normalizer.
// Endpoint /active-ats accepts: title, location, time_frame (1h|24h|7d|6m), limit, offset.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobSource } from '@/generated/prisma';
import { AppConfig } from '@/config/configuration';
import {
  FetchQuery,
  JobSourceAdapter,
  NormalizedJobInput,
  RawJob,
} from '@/ingestion/adapters/job-source.adapter';
import {
  FantasticJobsRawJob,
  mapCountryToLocation,
  mapFantasticTimeFrame,
  normalizeFantasticJob,
} from '@/ingestion/adapters/fantastic-jobs.shared';
import { rapidApiGet } from '@/ingestion/adapters/rapidapi.util';

const API_HOST = 'active-jobs-db.p.rapidapi.com';
const ENDPOINT_PATH = '/active-ats';
const PAGE_SIZE = 10;

@Injectable()
export class ActiveJobsDbAdapter implements JobSourceAdapter {
  // Multi-ATS aggregator → OTHER at the FetchLog level (per-job source is mapped in normalize).
  readonly source = JobSource.OTHER;

  private readonly logger = new Logger(ActiveJobsDbAdapter.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async fetchJobs(_query: FetchQuery): Promise<RawJob[]> {
    const jsearch = this.configService.get('jsearch', { infer: true });
    const allJobs: RawJob[] = [];

    for (let page = 1; page <= jsearch.pages; page += 1) {
      const data = await rapidApiGet<FantasticJobsRawJob[]>({
        host: API_HOST,
        path: ENDPOINT_PATH,
        apiKey: jsearch.apiKey,
        params: {
          title: jsearch.query,
          location: mapCountryToLocation(jsearch.country),
          time_frame: mapFantasticTimeFrame(jsearch.datePosted),
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
        logger: this.logger,
      });

      const jobs = Array.isArray(data) ? data : [];
      allJobs.push(...(jobs as unknown as RawJob[]));

      if (jobs.length < PAGE_SIZE) {
        break;
      }
    }

    this.logger.log(`Active Jobs DB fetched ${allJobs.length} raw jobs`);
    return allJobs;
  }

  normalize(raw: RawJob): NormalizedJobInput {
    return normalizeFantasticJob(raw);
  }
}
