import type { NextFunction, Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabaseClient.ts';
import { logger } from '../utils/logger.ts';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

export interface RateLimitStore {
  consume(key: string, maxRequests: number, windowMs: number): Promise<RateLimitDecision>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, maxRequests: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      this.prune(now);
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - 1),
        resetAtMs: resetAt,
      };
    }

    if (existing.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAtMs: existing.resetAt,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - existing.count),
      resetAtMs: existing.resetAt,
    };
  }

  private prune(now: number) {
    if (this.buckets.size < 2500) return;
    for (const [k, v] of this.buckets.entries()) {
      if (now >= v.resetAt) {
        this.buckets.delete(k);
      }
    }
  }
}

class SupabaseRateLimitStore implements RateLimitStore {
  private fallback = new MemoryRateLimitStore();
  private tableUnavailable = false;

  async consume(key: string, maxRequests: number, windowMs: number): Promise<RateLimitDecision> {
    if (this.tableUnavailable) {
      return this.fallback.consume(key, maxRequests, windowMs);
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      return this.fallback.consume(key, maxRequests, windowMs);
    }

    try {
      const now = Date.now();
      const { data, error } = await supabase
        .from('api_rate_limits')
        .select('key, count, reset_at')
        .eq('key', key)
        .maybeSingle();

      if (error) {
        // Table not provisioned on this deployment; gracefully fall back
        this.tableUnavailable = true;
        return this.fallback.consume(key, maxRequests, windowMs);
      }

      if (!data || Number(data.reset_at) <= now) {
        const resetAt = now + windowMs;
        await supabase.from('api_rate_limits').upsert({
          key,
          count: 1,
          reset_at: resetAt,
        });
        return {
          allowed: true,
          remaining: Math.max(0, maxRequests - 1),
          resetAtMs: resetAt,
        };
      }

      const currentCount = Number(data.count || 0);
      const resetAt = Number(data.reset_at);
      if (currentCount >= maxRequests) {
        return { allowed: false, remaining: 0, resetAtMs: resetAt };
      }

      await supabase
        .from('api_rate_limits')
        .update({ count: currentCount + 1 })
        .eq('key', key);

      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - (currentCount + 1)),
        resetAtMs: resetAt,
      };
    } catch {
      return this.fallback.consume(key, maxRequests, windowMs);
    }
  }
}

const sharedStore: RateLimitStore =
  process.env.NODE_ENV === 'production' && getSupabaseClient()
    ? new SupabaseRateLimitStore()
    : new MemoryRateLimitStore();

export function createRateLimitMiddleware(options: {
  bucket: string;
  max: number;
  windowMs: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (options.skip?.(req)) {
      return next();
    }

    // Never block internal automated unit tests executing over loopback bursts unless testing rate-limit itself
    if (process.env.NODE_TEST_CONTEXT && req.headers['x-test-rate-limit'] !== '1') {
      return next();
    }

    const identity =
      options.keyGenerator?.(req) || req.ip || req.socket.remoteAddress || 'unknown';
    const fullKey = `${options.bucket}:${identity}`;

    try {
      const decision = await sharedStore.consume(fullKey, options.max, options.windowMs);
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(decision.resetAtMs / 1000)));

      if (!decision.allowed) {
        const retrySec = Math.max(1, Math.ceil((decision.resetAtMs - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retrySec));
        logger.warn('Rate limit exceeded', {
          requestId: (req as any).requestId,
          bucket: options.bucket,
          route: req.originalUrl,
        });
        return res.status(429).json({
          error: `Too many requests. Please wait ${retrySec} seconds before trying again.`,
          retryAfterSec: retrySec,
        });
      }
      next();
    } catch {
      next();
    }
  };
}

export const rateLimiters = {
  globalApi: createRateLimitMiddleware({
    bucket: 'api-global',
    max: 180,
    windowMs: 60 * 1000,
    skip: (req) => req.path === '/health' || req.path.startsWith('/streaming/hls-proxy'),
  }),
  search: createRateLimitMiddleware({
    bucket: 'api-search',
    max: 45,
    windowMs: 60 * 1000,
  }),
  auth: createRateLimitMiddleware({
    bucket: 'api-auth',
    max: 15,
    windowMs: 10 * 60 * 1000,
  }),
  admin: createRateLimitMiddleware({
    bucket: 'api-admin',
    max: 90,
    windowMs: 5 * 60 * 1000,
  }),
  ai: createRateLimitMiddleware({
    bucket: 'api-ai',
    max: 15,
    windowMs: 5 * 60 * 1000,
  }),
};
