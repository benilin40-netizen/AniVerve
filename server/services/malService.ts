import type { MalAnimeInfo, MalFetchMeta } from '../../src/types/anime.ts';
import { cleanEnv } from '../utils/env.ts';
import { dedupeInFlight, reliableFetch, TIMEOUTS } from '../utils/httpClient.ts';
import {
  getCachedWithMeta,
  getStaleFallbackWithMeta,
  recordApiMetric,
  setCached,
} from './cacheService.ts';

const JIKAN_BASE = cleanEnv(process.env.JIKAN_API_URL, 'https://api.jikan.moe/v4');

// Rate limit queue to keep Jikan requests <= ~2.5 req/sec
let queueTail: Promise<void> = Promise.resolve();
let lastRequestTs = 0;

function enqueueJikanRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const elapsed = Date.now() - lastRequestTs;
    if (elapsed < 400) {
      await new Promise((r) => setTimeout(r, 400 - elapsed));
    }
    lastRequestTs = Date.now();
    return fn();
  });
  queueTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function getCachedMalScore(malId?: number | null): number | null {
  if (!malId || !Number.isInteger(malId) || malId <= 0) return null;
  const cacheKey = `jikan:anime:${malId}`;
  const info =
    getCachedWithMeta<MalAnimeInfo>(cacheKey)?.data ||
    getStaleFallbackWithMeta<MalAnimeInfo>(cacheKey)?.data;
  return typeof info?.score === 'number' ? info.score : null;
}

export async function getMalAnimeInfoWithMeta(
  malId?: number | null
): Promise<{ info: MalAnimeInfo | null; meta: MalFetchMeta }> {
  if (!malId || !Number.isInteger(malId) || malId <= 0) {
    return {
      info: null,
      meta: {
        status: 'no_mal_id',
        fetchedAt: null,
        error: 'No MyAnimeList ID mapping provided by AniList for this entry.',
      },
    };
  }

  const cacheKey = `jikan:anime:${malId}`;
  const cached = getCachedWithMeta<MalAnimeInfo>(cacheKey);
  if (cached) {
    return {
      info: cached.data,
      meta: {
        status: 'verified_api',
        fetchedAt: new Date(cached.updatedAt).toISOString(),
        error: null,
      },
    };
  }

  const fallback = getStaleFallbackWithMeta<MalAnimeInfo>(cacheKey);

  return dedupeInFlight(`mal:${malId}`, () =>
    enqueueJikanRequest(async () => {
      const start = Date.now();
      try {
        const res = await reliableFetch(`${JIKAN_BASE}/anime/${malId}/full`, {
          headers: { Accept: 'application/json' },
          timeoutMs: TIMEOUTS.CATALOG_MS,
          maxAttempts: 2,
          onAttemptFailed: ({ message, latencyMs }) => {
            recordApiMetric('Jikan / MAL v4', false, latencyMs, message);
          },
        });

        if (res.status === 404) {
          recordApiMetric('Jikan / MAL v4', true, Date.now() - start);
          return {
            info: null,
            meta: {
              status: 'unavailable',
              fetchedAt: new Date().toISOString(),
              error: 'Entry not found on MyAnimeList (Jikan HTTP 404).',
            },
          };
        }

        if (!res.ok) {
          throw new Error(`Jikan HTTP ${res.status}`);
        }

        const json = (await res.json()) as { data?: MalAnimeInfo };
        if (!json.data) {
          return {
            info: null,
            meta: {
              status: 'unavailable',
              fetchedAt: new Date().toISOString(),
              error: 'Jikan returned empty anime payload.',
            },
          };
        }

        recordApiMetric('Jikan / MAL v4', true, Date.now() - start);
        // Cache for 6 hours
        setCached(cacheKey, json.data, 21600);
        return {
          info: json.data,
          meta: {
            status: 'verified_api',
            fetchedAt: new Date().toISOString(),
            error: null,
          },
        };
      } catch (err) {
        const lastErrMsg = err instanceof Error ? err.message : String(err);
        recordApiMetric('Jikan / MAL v4', false, Date.now() - start, lastErrMsg);

        if (fallback) {
          return {
            info: fallback.data,
            meta: {
              status: 'cached_stale',
              fetchedAt: new Date(fallback.updatedAt).toISOString(),
              error: lastErrMsg,
            },
          };
        }

        return {
          info: null,
          meta: {
            status: 'unavailable',
            fetchedAt: null,
            error: lastErrMsg,
          },
        };
      }
    })
  );
}

export async function getMalAnimeInfo(malId: number): Promise<MalAnimeInfo | null> {
  const res = await getMalAnimeInfoWithMeta(malId);
  return res.info;
}
