// Typed configuration factory — single source for all env-backed settings.
export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',

  db: {
    url: process.env.DATABASE_URL ?? '',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
    url: process.env.REDIS_URL || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
  },

  cookie: {
    name: process.env.REFRESH_COOKIE_NAME ?? 'jobicy_rt',
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: (process.env.COOKIE_SAMESITE ?? 'lax') as
      | 'lax'
      | 'strict'
      | 'none',
    domain: process.env.COOKIE_DOMAIN || undefined,
  },

  jsearch: {
    apiKey: process.env.JSEARCH_API_KEY ?? '',
    apiHost: process.env.JSEARCH_API_HOST ?? 'jsearch.p.rapidapi.com',
    query:
      process.env.JSEARCH_QUERY ??
      'fullstack OR backend OR frontend OR software developer OR engineer in bangladesh',
    country: process.env.JSEARCH_COUNTRY ?? 'bd',
    datePosted: process.env.JSEARCH_DATE_POSTED ?? 'today',
    pages: parseInt(process.env.JSEARCH_PAGES ?? '5', 10),
    timezone: process.env.INGESTION_TIMEZONE ?? 'Asia/Dhaka',
  },

  // JSearch RapidAPI (jsearch.p.rapidapi.com) — /search + optional /job-details.
  jsearchApi: {
    host: process.env.JSEARCH_RAPIDAPI_HOST ?? 'jsearch.p.rapidapi.com',
    fetchDetails: process.env.JSEARCH_RAPIDAPI_FETCH_DETAILS !== 'false',
    maxDetailFetches: parseInt(
      process.env.JSEARCH_RAPIDAPI_MAX_DETAIL_FETCHES ?? '10',
      10,
    ),
  },

  jobs: {
    // Jobs not seen by ingestion for this many days are purged (storage cap).
    retentionDays: parseInt(process.env.JOB_RETENTION_DAYS ?? '30', 10),
  },

  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Jobicy <no-reply@jobicy.app>',
  },

  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '900', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  },

  seed: {
    adminName: process.env.SEED_ADMIN_NAME ?? 'Admin',
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@jobicy.app',
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
  },

  // Optional Azure OpenAI — fills plain-language skill phrases when regex finds < 3 tags.
  azureOpenAi: {
    enabled: process.env.AZURE_OPENAI_ENABLED === 'true',
    endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? '',
    apiKey: process.env.AZURE_OPENAI_API_KEY ?? '',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? '',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview',
  },
});

/** Shape returned by the configuration factory (for ConfigService typing). */
export type AppConfig = ReturnType<typeof import('./configuration').default>;
