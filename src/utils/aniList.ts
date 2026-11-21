import type { AnimeSummary } from '../types/anime.ts';
import { buildAnimeSlug } from './slug.ts';

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const CACHE_KEY = 'aniverve:recently_updated_airing_v1';
const CACHE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA', 'MOVIE']);
const ALLOWED_STATUSES = new Set(['RELEASING', 'FINISHED']);
const WINDOW_DAYS = [7, 14, 30] as const;

interface CachedRecentlyUpdated {
  items: AnimeSummary[];
  fetchedAt: number;
  windowDays: number;
}

let memoryCache: CachedRecentlyUpdated | null = null;

function readCachedRecentlyUpdated(allowStale = false): CachedRecentlyUpdated | null {
  const now = Date.now();
  if (memoryCache) {
    if (allowStale || now - memoryCache.fetchedAt < CACHE_TTL_MS) {
      return memoryCache;
    }
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedRecentlyUpdated;
        if (parsed && Array.isArray(parsed.items)) {
          if (allowStale || now - parsed.fetchedAt < CACHE_TTL_MS) {
            memoryCache = parsed;
            return parsed;
          }
        }
      }
    } catch {
      // Ignore storage access/parse errors
    }
  }
  return null;
}

function writeCachedRecentlyUpdated(entry: CachedRecentlyUpdated): void {
  memoryCache = entry;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
      // Ignore storage quota errors
    }
  }
}

const RECENTLY_UPDATED_QUERY = `
  query RecentlyUpdatedAiringSchedules($greater: Int, $lesser: Int) {
    Page(page: 1, perPage: 50) {
      airingSchedules(airingAt_greater: $greater, airingAt_lesser: $lesser, sort: TIME_DESC) {
        airingAt
        episode
        media {
          id
          idMal
          title {
            romaji
            english
            native
            userPreferred
          }
          coverImage {
            large
            extraLarge
          }
          averageScore
          episodes
          status
          format
          seasonYear
          isAdult
        }
      }
    }
  }
`;

export interface FetchRecentlyUpdatedResult {
  items: AnimeSummary[];
  fromCache: boolean;
  isStale: boolean;
  windowDays: number;
  fetchedAt: string;
}

export async function fetchRecentlyUpdatedAnime(options?: {
  signal?: AbortSignal;
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<FetchRecentlyUpdatedResult> {
  if (!options?.forceRefresh) {
    const fresh = readCachedRecentlyUpdated(false);
    if (fresh && fresh.items.length > 0) {
      return {
        items: fresh.items,
        fromCache: true,
        isStale: false,
        windowDays: fresh.windowDays,
        fetchedAt: new Date(fresh.fetchedAt).toISOString(),
      };
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const timeoutMs = Math.max(15000, options?.timeoutMs ?? 18000);
  let lastError: unknown = null;
  let bestItems: AnimeSummary[] = [];
  let usedWindow = 7;

  for (const days of WINDOW_DAYS) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const greater = nowSec - days * 86400;
    const lesser = nowSec;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.signal
      ? AbortSignal.any
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal
      : controller.signal;

    try {
      const response = await fetch(ANILIST_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: RECENTLY_UPDATED_QUERY,
          variables: { greater, lesser },
        }),
        signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`AniList HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        data?: { Page?: { airingSchedules?: any[] } };
        errors?: Array<{ message: string }>;
      };

      if (payload.errors?.length) {
        throw new Error(payload.errors.map((e) => e.message).join('; '));
      }

      const schedules = payload.data?.Page?.airingSchedules || [];
      const seenIds = new Set<number>();
      const filtered: AnimeSummary[] = [];

      // Schedules are sorted TIME_DESC; iterating in order keeps newest episode per media id.
      for (const entry of schedules) {
        const media = entry?.media;
        if (!media || media.isAdult === true) continue;
        if (seenIds.has(media.id)) continue;
        if (!ALLOWED_STATUSES.has(media.status)) continue;
        if (!ALLOWED_FORMATS.has(media.format)) continue;

        seenIds.add(media.id);
        filtered.push({
          ...media,
          slug: buildAnimeSlug(media.id, media.title),
          latestEpisode: entry.episode,
          airingAt: entry.airingAt,
        });
      }

      bestItems = filtered;
      usedWindow = days;

      if (bestItems.length >= 12) {
        break;
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (options?.signal?.aborted) {
        throw err;
      }
      lastError = err;
      break;
    }
  }

  if (bestItems.length > 0) {
    const cacheEntry: CachedRecentlyUpdated = {
      items: bestItems,
      fetchedAt: Date.now(),
      windowDays: usedWindow,
    };
    writeCachedRecentlyUpdated(cacheEntry);
    return {
      items: bestItems,
      fromCache: false,
      isStale: false,
      windowDays: usedWindow,
      fetchedAt: new Date(cacheEntry.fetchedAt).toISOString(),
    };
  }

  const stale = readCachedRecentlyUpdated(true);
  if (stale && stale.items.length > 0) {
    return {
      items: stale.items,
      fromCache: true,
      isStale: true,
      windowDays: stale.windowDays,
      fetchedAt: new Date(stale.fetchedAt).toISOString(),
    };
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to load recently updated airing schedules from AniList.');
}
