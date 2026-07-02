/**
 * Dev seed: one ADMIN user + sample jobs for local UI/analytics testing.
 * Idempotent — safe to re-run (upsert by email / job fingerprint).
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  JobCategory,
  JobSource,
  JobType,
  LocationType,
  PrismaClient,
  Role,
  SalaryCurrency,
} from '../src/generated/prisma';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for seed');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** Same dedup hash used by ingestion (title + company normalized). */
function fingerprint(title: string, company: string): string {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${norm(title)}|${norm(company)}`)
    .digest('hex');
}

/** Read seed credentials from env (see claude.md §5). */
function seedConfig() {
  const name = process.env.SEED_ADMIN_NAME ?? 'Admin';
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@jobicy.app';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  return { name, email, password, rounds };
}

/** Sample jobs spanning categories and sources for dev dashboards. */
const SAMPLE_JOBS = [
  {
    title: 'Fullstack Developer',
    company: 'Brain Station 23',
    category: JobCategory.FULLSTACK,
    source: JobSource.BDJOBS,
    skills: ['React', 'Node.js', 'PostgreSQL'],
    location: 'Dhaka, Gulshan',
    locationType: LocationType.HYBRID,
    salaryMin: 80000,
    salaryMax: 120000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'Backend Engineer',
    company: 'bKash',
    category: JobCategory.BACKEND,
    source: JobSource.LINKEDIN,
    skills: ['Java', 'Spring Boot', 'Kafka'],
    location: 'Dhaka, Bashundhara',
    locationType: LocationType.ONSITE,
    salaryMin: 100000,
    salaryMax: 150000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'Frontend Developer',
    company: 'Pathao',
    category: JobCategory.FRONTEND,
    source: JobSource.INDEED,
    skills: ['React', 'TypeScript', 'Tailwind CSS'],
    location: 'Dhaka, Banani',
    locationType: LocationType.REMOTE,
    salaryMin: 70000,
    salaryMax: 110000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'Software Engineer',
    company: 'Grameenphone',
    category: JobCategory.SOFTWARE_ENGINEER,
    source: JobSource.GLASSDOOR,
    skills: ['Python', 'Django', 'AWS'],
    location: 'Dhaka, Niketan',
    locationType: LocationType.ONSITE,
    salaryMin: 90000,
    salaryMax: 130000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'Senior Fullstack Engineer',
    company: 'SSL Wireless',
    category: JobCategory.FULLSTACK,
    source: JobSource.BDJOBS,
    skills: ['Vue.js', 'Laravel', 'MySQL'],
    location: 'Chittagong',
    locationType: LocationType.HYBRID,
    salaryNegotiable: true,
  },
  {
    title: 'Backend Developer',
    company: 'Nagad',
    category: JobCategory.BACKEND,
    source: JobSource.LINKEDIN,
    skills: ['Go', 'PostgreSQL', 'Redis'],
    location: 'Dhaka, Motijheel',
    locationType: LocationType.ONSITE,
    salaryMin: 95000,
    salaryMax: 140000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'React Frontend Engineer',
    company: 'Shohoz',
    category: JobCategory.FRONTEND,
    source: JobSource.OTHER,
    skills: ['React', 'Next.js', 'GraphQL'],
    location: 'Dhaka, Uttara',
    locationType: LocationType.REMOTE,
    salaryMin: 75000,
    salaryMax: 105000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'DevOps Engineer',
    company: 'Augmedix',
    category: JobCategory.DEVOPS,
    source: JobSource.LINKEDIN,
    skills: ['Docker', 'Kubernetes', 'Terraform'],
    location: 'Dhaka, Gulshan',
    locationType: LocationType.HYBRID,
    salaryMin: 120000,
    salaryMax: 180000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'Mobile Developer',
    company: 'Chaldal',
    category: JobCategory.MOBILE,
    source: JobSource.BDJOBS,
    skills: ['Flutter', 'Dart', 'Firebase'],
    location: 'Dhaka, Mohakhali',
    locationType: LocationType.ONSITE,
    salaryMin: 65000,
    salaryMax: 100000,
    salaryCurrency: SalaryCurrency.BDT,
  },
  {
    title: 'QA Engineer',
    company: 'Kazi Farms',
    category: JobCategory.QA,
    source: JobSource.INDEED,
    skills: ['Selenium', 'Jest', 'Cypress'],
    location: 'Dhaka, Tejgaon',
    locationType: LocationType.ONSITE,
    salaryMin: 45000,
    salaryMax: 70000,
    salaryCurrency: SalaryCurrency.BDT,
  },
] as const;

async function seedAdmin(): Promise<void> {
  const { name, email, password, rounds } = seedConfig();
  const hashed = await bcrypt.hash(password, rounds);

  await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      password: hashed,
      role: Role.ADMIN,
      emailVerified: true,
      profile: { create: { skills: ['TypeScript', 'React', 'Node.js'] } },
    },
    update: {
      name,
      password: hashed,
      role: Role.ADMIN,
      emailVerified: true,
    },
  });
}

async function seedJobs(): Promise<void> {
  const now = new Date();

  for (const sample of SAMPLE_JOBS) {
    const fp = fingerprint(sample.title, sample.company);

    await prisma.job.upsert({
      where: { fingerprint: fp },
      create: {
        fingerprint: fp,
        title: sample.title,
        company: sample.company,
        location: sample.location,
        locationType: sample.locationType,
        jobType: JobType.FULL_TIME,
        category: sample.category,
        skills: [...sample.skills],
        salaryMin: 'salaryMin' in sample ? sample.salaryMin : null,
        salaryMax: 'salaryMax' in sample ? sample.salaryMax : null,
        salaryCurrency:
          'salaryCurrency' in sample ? sample.salaryCurrency : null,
        salaryNegotiable:
          'salaryNegotiable' in sample ? sample.salaryNegotiable : false,
        experienceMin: 2,
        experienceMax: 5,
        description: `## ${sample.title}\n\nJoin **${sample.company}** and build products for the Bangladesh developer market.`,
        requirements: ['Bachelor in CSE or equivalent', '2+ years experience'],
        benefits: ['Flexible hours', 'Health insurance'],
        postedAt: now,
        source: sample.source,
        sourceUrl: `https://example.com/jobs/${fp.slice(0, 8)}`,
        isActive: true,
      },
      update: {
        lastSeenAt: now,
        isActive: true,
      },
    });
  }
}

async function main(): Promise<void> {
  await seedAdmin();
  await seedJobs();
  process.stdout.write('Seed complete: admin user + sample jobs upserted.\n');
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
