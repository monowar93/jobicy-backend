// Title/company/skill normalization and developer-role category classification.
import { JobCategory } from '@/generated/prisma';

/** Maps common skill aliases to canonical display names. */
export const SKILL_MAP: Record<string, string> = {
  reactjs: 'React',
  'react.js': 'React',
  react: 'React',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
  node: 'Node.js',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  js: 'JavaScript',
  javascript: 'JavaScript',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mongo: 'MongoDB',
  mongodb: 'MongoDB',
  aws: 'AWS',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
};

/**
 * Normalizes a job title for deduplication so the same posting from different
 * sources collapses to one fingerprint. Removes bracketed notes, seniority and
 * level markers, work-arrangement words, and separators, then collapses spaces.
 * Example: "Senior Software Engineer (Remote) - II" → "software engineer".
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ') // drop "(...)", "[...]", "{...}"
    .replace(/\b(sr|jr|senior|junior|mid|entry|lead|principal|staff)[\s-]?(level)?\b\.?/gi, ' ')
    .replace(/\b(remote|hybrid|on[\s-]?site|onsite|contract|full[\s-]?time|part[\s-]?time)\b/gi, ' ')
    .replace(/\b(i{1,3}|iv|v|vi{0,3})\b/gi, ' ') // trailing roman-numeral levels
    .replace(/[/|,\-–—_:]+/g, ' ') // separators → space
    .replace(/[^a-z0-9+#. ]/g, '') // keep letters/digits + a few tech chars
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a company name for deduplication: lowercases, strips legal suffixes,
 * trademark symbols, a leading "the", and punctuation, then collapses spaces.
 * Example: "The Acme Technologies, Inc.®" → "acme technologies".
 */
export function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/[®™©]/g, ' ')
    .replace(/^the\s+/i, '')
    .replace(
      /\b(ltd|limited|inc|incorporated|pvt|private|llc|llp|plc|corp|corporation|company|co|gmbh|ag|sa|bv|pte|oy|ltda|srl)\b\.?/gi,
      ' ',
    )
    .replace(/[^a-z0-9 ]/g, ' ') // drop punctuation/dots/commas
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a skill string using SKILL_MAP aliases.
 */
export function normalizeSkill(skill: string): string {
  const key = skill.toLowerCase().trim();
  return SKILL_MAP[key] ?? skill.trim();
}

/**
 * Strips HTML tags and decodes a few common entities into readable plain text.
 * Used to clean provider descriptions that arrive as HTML (Jobicy, remote-jobs1).
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|br)>/gi, '\n') // block endings → newlines
    .replace(/<li[^>]*>/gi, '- ') // list items → bullets
    .replace(/<[^>]+>/g, '') // remove all remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&hellip;/gi, '...')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n') // collapse excess blank lines
    .trim();
}

/** Bangladesh place-name tokens used to detect a BD-based job location. */
const BANGLADESH_TOKENS = [
  'bangladesh',
  'dhaka',
  'chattogram',
  'chittagong',
  'sylhet',
  'khulna',
  'rajshahi',
  'barisal',
  'rangpur',
  'mymensingh',
  'narayanganj',
  'gazipur',
  'cumilla',
  'comilla',
];

/**
 * Returns true when a location string refers to Bangladesh.
 * Used by ingestion to keep BD jobs (any work type) while only keeping remote
 * jobs from elsewhere. Matches BD city/country names or the ISO code "bd".
 */
export function isBangladeshLocation(location: string): boolean {
  const value = (location ?? '').toLowerCase();
  if (!value) {
    return false;
  }
  if (BANGLADESH_TOKENS.some((token) => value.includes(token))) {
    return true;
  }
  return /\bbd\b/.test(value); // standalone "bd", not inside another word
}

/**
 * Classifies a job into a developer category from title + skills keywords.
 */
export function classifyCategory(
  title: string,
  skills: string[],
): JobCategory {
  const haystack = `${title} ${skills.join(' ')}`.toLowerCase();

  if (
    /full[\s-]?stack|fullstack/.test(haystack) ||
    (haystack.includes('frontend') && haystack.includes('backend'))
  ) {
    return JobCategory.FULLSTACK;
  }
  if (/back[\s-]?end|backend/.test(haystack)) {
    return JobCategory.BACKEND;
  }
  if (/front[\s-]?end|frontend/.test(haystack)) {
    return JobCategory.FRONTEND;
  }
  if (/software engineer|software developer/.test(haystack)) {
    return JobCategory.SOFTWARE_ENGINEER;
  }
  if (/mobile|android|ios|flutter|react native/.test(haystack)) {
    return JobCategory.MOBILE;
  }
  if (/devops|sre|platform engineer/.test(haystack)) {
    return JobCategory.DEVOPS;
  }
  if (/\bqa\b|quality assurance|test engineer/.test(haystack)) {
    return JobCategory.QA;
  }
  // Generic developer/engineer titles (e.g. "Java Developer", "Web Engineer").
  // Checked last so DevOps/QA/Mobile stay precise; drops only clearly non-dev roles.
  if (/\b(developer|engineer|programmer)\b/.test(haystack)) {
    return JobCategory.SOFTWARE_ENGINEER;
  }

  return JobCategory.OTHER;
}
