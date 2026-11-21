interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  updatedAt: number;
}

interface StaleEntry<T> {
  data: T;
  updatedAt: number;
}

export interface ApiMetric {
  source: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  lastLatencyMs: number;
  lastStatus: 'ok' | 'degraded' | 'error';
  lastError: string | null;
  lastUpdated: string;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const staleCache = new Map<string, StaleEntry<any>>();
const apiMetrics = new Map<string, ApiMetric>();
const recentApiErrors: Array<{ source: string; message: string; timestamp: string }> = [];

export function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function getCachedWithMeta<T>(key: string): { data: T; updatedAt: number } | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return { data: entry.data as T, updatedAt: entry.updatedAt };
}

export function getStaleFallback<T>(key: string): T | null {
  const entry = staleCache.get(key);
  return entry ? (entry.data as T) : null;
}

export function getStaleFallbackWithMeta<T>(key: string): { data: T; updatedAt: number } | null {
  const entry = staleCache.get(key);
  return entry ? { data: entry.data as T, updatedAt: entry.updatedAt } : null;
}

export function setCached<T>(key: string, data: T, ttlSeconds: number): void {
  const now = Date.now();
  memoryCache.set(key, {
    data,
    expiresAt: now + ttlSeconds * 1000,
    updatedAt: now,
  });
  staleCache.set(key, { data, updatedAt: now });

  // Prevent unbounded cache growth
  if (memoryCache.size > 600) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  if (staleCache.size > 600) {
    const firstKey = staleCache.keys().next().value;
    if (firstKey) staleCache.delete(firstKey);
  }
}

export function clearCacheByPrefix(prefix: string): number {
  let cleared = 0;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      cleared++;
    }
  }
  return cleared;
}

export function recordApiMetric(
  source: string,
  ok: boolean,
  latencyMs: number,
  errorMessage?: string
): void {
  const existing = apiMetrics.get(source) || {
    source,
    totalCalls: 0,
    successCount: 0,
    errorCount: 0,
    lastLatencyMs: 0,
    lastStatus: 'ok' as const,
    lastError: null,
    lastUpdated: new Date().toISOString(),
  };

  existing.totalCalls += 1;
  if (ok) {
    existing.successCount += 1;
    existing.lastStatus = 'ok';
    existing.lastError = null;
  } else {
    existing.errorCount += 1;
    existing.lastStatus = 'error';
    existing.lastError = errorMessage || 'Request failed';
    recentApiErrors.unshift({
      source,
      message: existing.lastError,
      timestamp: new Date().toISOString(),
    });
    if (recentApiErrors.length > 50) recentApiErrors.pop();
  }
  existing.lastLatencyMs = latencyMs;
  existing.lastUpdated = new Date().toISOString();
  apiMetrics.set(source, existing);
}

export function getCacheStats() {
  return {
    activeEntries: memoryCache.size,
    fallbackEntries: staleCache.size,
    metrics: Array.from(apiMetrics.values()),
    recentErrors: [...recentApiErrors],
  };
}
