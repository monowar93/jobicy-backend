// Redis cache helpers — get/set/del, pattern delete, and cache-aside wrap.
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '@/config/configuration';

/** Cache TTL constants in seconds (per plan §10). */
export const TTL = {
  JOBS: 900,
  JOB: 1800,
  ANALYTICS: 3600,
} as const;

/** Logical cache groups invalidated via a generation counter (1 INCR vs SCAN+DEL). */
export type CacheNamespace = 'jobs' | 'analytics';

const CACHE_GEN_KEY: Record<CacheNamespace, string> = {
  jobs: 'cache:gen:jobs',
  analytics: 'cache:gen:analytics',
};

/** How long an in-process generation value is reused before re-reading Redis. */
const GEN_MEMORY_TTL_MS = 5_000;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly genMemory = new Map<
    CacheNamespace,
    { value: number; at: number }
  >();

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.client = this.createClient();
  }

  /** Prefer REDIS_URL when set; otherwise use discrete host/port/password fields. */
  private createClient(): Redis {
    const redisConfig = this.configService.get('redis', { infer: true });

    if (redisConfig.url) {
      return new Redis(redisConfig.url, {
        keyPrefix: 'app1:',
      });
    }

    return new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      keyPrefix: 'app1:',
      tls: redisConfig.tls ? {} : undefined,
    });
  }

  /** Exposes the raw ioredis client (used by BullMQ in later phases). */
  getClient(): Redis {
    return this.client;
  }

  /** Read a JSON-serialized value; returns null when the key is missing. */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  /** Store a value as JSON with an optional TTL in seconds. */
  async set(key: string, value: unknown, ttlSec?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSec !== undefined) {
      await this.client.set(key, serialized, 'EX', ttlSec);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /** Delete a single key. */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Current cache generation for a namespace. Keys include `v{N}` so a bump
   * invalidates all entries without SCAN+DEL (old keys expire via TTL).
   */
  async getCacheGeneration(namespace: CacheNamespace): Promise<number> {
    const now = Date.now();
    const cached = this.genMemory.get(namespace);
    if (cached && now - cached.at < GEN_MEMORY_TTL_MS) {
      return cached.value;
    }

    const raw = await this.client.get(CACHE_GEN_KEY[namespace]);
    const value = raw ? parseInt(raw, 10) : 0;
    this.genMemory.set(namespace, { value, at: now });
    return value;
  }

  /** Bump generation — O(1) invalidation for every versioned key in the namespace. */
  async invalidateCache(namespace: CacheNamespace): Promise<number> {
    const value = await this.client.incr(CACHE_GEN_KEY[namespace]);
    this.genMemory.set(namespace, { value, at: Date.now() });
    return value;
  }

  /**
   * Delete all keys matching a glob pattern (e.g. 'jobs:*').
   * Uses SCAN to avoid blocking Redis on large keyspaces.
   * Prefer {@link invalidateCache} for jobs/analytics namespaces.
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }

  /**
   * Cache-aside: return cached value or run fn, store result, then return it.
   */
  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fn();
    await this.set(key, fresh, ttlSec);
    return fresh;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
