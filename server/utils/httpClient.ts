import { cleanEnv } from './env.ts';

function envMs(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(cleanEnv(process.env[name], ''));
  if (!Number.isFinite(raw) || raw < min || raw > max) return fallback;
  return Math.floor(raw);
}

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const TIMEOUTS = {
  CATALOG_MS: envMs('API_TIMEOUT_CATALOG_MS', 18_000, 5_000, 60_000),
  EPISODE_DISCOVERY_MS: envMs('API_TIMEOUT_EPISODES_MS', 25_000, 10_000, 60_000),
  STREAM_RESOLUTION_MS: envMs('API_TIMEOUT_STREAM_MS', 35_000, 15_000, 60_000),
  PROVIDER_HEALTH_MS: envMs('API_TIMEOUT_HEALTH_MS', 12_000, 4_000, 30_000),
} as const;

export class HttpRequestError extends Error {
  status: number;
  retryable: boolean;
  retryAfterMs?: number;
  timedOut: boolean;

  constructor(
    message: string,
    options: { status?: number; retryable?: boolean; retryAfterMs?: number; timedOut?: boolean } = {}
  ) {
    super(message);
    this.name = 'HttpRequestError';
    this.status = options.status ?? 0;
    this.retryable = Boolean(options.retryable);
    this.retryAfterMs = options.retryAfterMs;
    this.timedOut = Boolean(options.timedOut);
  }
}

export function parseRetryAfterMs(headerVal: string | null): number | undefined {
  if (!headerVal) return undefined;
  const trimmed = headerVal.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(seconds * 1000, 250), 30_000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    if (diff > 0) return Math.min(diff, 30_000);
  }
  return undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function computeBackoffWithJitter(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) {
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(retryAfterMs + jitter, 30_000);
  }
  const base = 450 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(base + jitter, 8_000);
}

export interface ReliableFetchOptions extends RequestInit {
  timeoutMs: number;
  maxAttempts?: number;
  externalSignal?: AbortSignal;
  onAttemptFailed?: (info: { attempt: number; status: number; message: string; latencyMs: number }) => void;
}

export async function reliableFetch(url: string, options: ReliableFetchOptions): Promise<Response> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 4));
  const { timeoutMs, externalSignal, onAttemptFailed, ...fetchInit } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Request cancelled by caller.', 'AbortError');
    }

    const controller = new AbortController();
    let timedOut = false;

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const startMs = Date.now();

    try {
      const res = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      const latencyMs = Date.now() - startMs;

      if (res.ok || (res.status >= 300 && res.status < 400 && fetchInit.redirect === 'manual')) {
        return res;
      }

      const retryable = isRetryableStatus(res.status);
      const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));

      // Cancel unread response body before throwing/retrying
      if (!retryable || attempt >= maxAttempts) {
        return res;
      }

      try {
        await res.body?.cancel();
      } catch {
        // Ignore stream cancellation error
      }

      const msg = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
      onAttemptFailed?.({ attempt, status: res.status, message: msg, latencyMs });
      lastError = new HttpRequestError(msg, { status: res.status, retryable: true, retryAfterMs });

      const waitMs = computeBackoffWithJitter(attempt, retryAfterMs);
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (err: any) {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }

      const latencyMs = Date.now() - startMs;

      if (externalSignal?.aborted && !timedOut) {
        throw new DOMException('Request cancelled by caller.', 'AbortError');
      }

      const message = timedOut
        ? `Request timed out after ${Math.round(timeoutMs / 1000)} seconds`
        : err instanceof Error
          ? err.message
          : String(err);

      onAttemptFailed?.({ attempt, status: 0, message, latencyMs });
      lastError = new HttpRequestError(message, { status: 0, retryable: true, timedOut });

      if (attempt < maxAttempts) {
        const waitMs = computeBackoffWithJitter(attempt);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new HttpRequestError('Upstream request failed after retries.', { retryable: false });
}

const inFlightMap = new Map<string, Promise<any>>();

export function dedupeInFlight<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlightMap.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = task().finally(() => {
    inFlightMap.delete(key);
  });
  inFlightMap.set(key, promise);
  return promise;
}
