import { Router } from 'express';
import {
  exploreAnime,
  getAiringSchedule,
  getAnimeDetailsWithMeta,
  getCharacterSpotlights,
  getDiscoveryCategories,
  getHomeCollections,
  resolveAnimeIds,
  searchAnimeQuick,
} from '../services/anilistService.ts';
import { getCachedMalScore, getMalAnimeInfoWithMeta } from '../services/malService.ts';
import {
  discoverAnimeEpisodes,
  getAnimeStreamingHealth,
  resolveEpisodeSources,
} from '../services/episodeDiscoveryService.ts';
import {
  getActiveFaceOff,
  getAnimeOfTheDay,
  getHomepageUniverseConfig,
  getSurpriseAnime,
  listCuratedCollections,
  universalSearch,
} from '../services/universeService.ts';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { dbGet, dbList, ensureDefaultSeedData, logAppError } from '../services/db.ts';
import { HttpRequestError } from '../utils/httpClient.ts';
import type { AnimeSummary, SystemSettings } from '../../src/types/anime.ts';

const router = Router();

const VALID_SEASONS = new Set(['WINTER', 'SPRING', 'SUMMER', 'FALL']);
const VALID_FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC']);
const VALID_STATUSES = new Set(['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS']);
const VALID_SORTS = new Set([
  'TRENDING_DESC',
  'POPULARITY_DESC',
  'SCORE_DESC',
  'UPDATED_AT_DESC',
  'FAVOURITES_DESC',
  'START_DATE_DESC',
  'SEARCH_MATCH',
]);

interface CatalogOverride {
  id: string;
  anilistId: number;
  featured: boolean;
  hidden: boolean;
  categories: string[];
  anime?: AnimeSummary;
}

async function getCatalogOverridesMap() {
  const list = await dbList<CatalogOverride>('anime_catalog_overrides');
  const map = new Map<number, CatalogOverride>();
  for (const item of list) {
    map.set(item.anilistId, item);
  }
  return map;
}

function filterHidden(items: AnimeSummary[], overrides: Map<number, CatalogOverride>) {
  return items
    .filter((item) => !overrides.get(item.id)?.hidden)
    .map((item) => {
      const cachedMal = getCachedMalScore(item.idMal);
      return cachedMal !== null ? { ...item, malScore: cachedMal } : item;
    });
}

router.get('/home', async (req, res) => {
  try {
    const [collections, overrides] = await Promise.all([
      getHomeCollections(),
      getCatalogOverridesMap(),
    ]);

    const adminFeatured = Array.from(overrides.values())
      .filter((o) => o.featured && !o.hidden && o.anime)
      .map((o) => o.anime!);

    res.json({
      _meta: collections._meta,
      season: collections.season,
      seasonYear: collections.seasonYear,
      featured:
        adminFeatured.length > 0
          ? adminFeatured
          : filterHidden(collections.trending, overrides).slice(0, 6),
      trending: filterHidden(collections.trending, overrides),
      popular: filterHidden(collections.popular, overrides),
      topRated: filterHidden(collections.topRated, overrides),
      seasonal: filterHidden(collections.seasonal, overrides),
      upcoming: filterHidden(collections.upcoming, overrides),
      airing: filterHidden(collections.airing, overrides),
      recentlyUpdated: filterHidden(collections.recentlyUpdated, overrides),
      recommended: filterHidden(collections.recommended, overrides),
      movies: filterHidden(collections.movies, overrides),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch AniList home collections.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'anilist',
      route: '/api/anime/home',
      statusCode: 502,
      message,
    });
    res.status(502).json({ error: message });
  }
});

router.get('/discovery-categories', async (req, res) => {
  try {
    const [result, overrides] = await Promise.all([
      getDiscoveryCategories(),
      getCatalogOverridesMap(),
    ]);

    res.json({
      _meta: result._meta,
      categories: result.categories.map((cat) => ({
        ...cat,
        items: filterHidden(cat.items, overrides),
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch discovery categories.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'anilist',
      route: '/api/anime/discovery-categories',
      statusCode: 502,
      message,
    });
    res.status(502).json({ error: message });
  }
});

router.get('/explore', async (req, res) => {
  try {
    const q = req.query;
    const rawYear = q.year ? Number(q.year) : undefined;
    if (rawYear !== undefined && (!Number.isInteger(rawYear) || rawYear < 1940 || rawYear > 2100)) {
      return res.status(400).json({ error: 'Year filter must be between 1940 and 2100.' });
    }
    const rawPage = q.page ? Number(q.page) : 1;
    const rawPerPage = q.perPage ? Number(q.perPage) : 24;
    if (!Number.isInteger(rawPage) || rawPage < 1 || rawPage > 500) {
      return res.status(400).json({ error: 'Page must be a positive integer.' });
    }

    const season = typeof q.season === 'string' && VALID_SEASONS.has(q.season) ? q.season : undefined;
    const format = typeof q.format === 'string' && VALID_FORMATS.has(q.format) ? q.format : undefined;
    const status = typeof q.status === 'string' && VALID_STATUSES.has(q.status) ? q.status : undefined;
    const sort = typeof q.sort === 'string' && VALID_SORTS.has(q.sort) ? q.sort : undefined;

    const [result, overrides] = await Promise.all([
      exploreAnime({
        search: typeof q.search === 'string' ? q.search.slice(0, 120) : undefined,
        genre: typeof q.genre === 'string' ? q.genre.slice(0, 60) : undefined,
        tag: typeof q.tag === 'string' && q.tag.trim() ? q.tag.trim().slice(0, 80) : undefined,
        year: rawYear,
        season,
        format,
        status,
        sort,
        page: rawPage,
        perPage: Math.min(36, Math.max(1, Number.isFinite(rawPerPage) ? rawPerPage : 24)),
      }),
      getCatalogOverridesMap(),
    ]);

    res.json({
      _meta: result._meta,
      pageInfo: result.pageInfo,
      media: filterHidden(result.media, overrides),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to explore anime catalog.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'anilist',
      route: '/api/anime/explore',
      statusCode: 502,
      message,
    });
    res.status(502).json({ error: message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '';
    if (!query.trim()) {
      return res.json({ results: [] });
    }
    const [results, overrides] = await Promise.all([
      searchAnimeQuick(query, 8),
      getCatalogOverridesMap(),
    ]);
    res.json({ results: filterHidden(results, overrides) });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Search failed.',
    });
  }
});

router.get('/schedule', async (req, res) => {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const start = req.query.start ? Number(req.query.start) : nowSec - 86400;
    const end = req.query.end ? Number(req.query.end) : nowSec + 7 * 86400;
    const page = req.query.page ? Number(req.query.page) : 1;
    const perPage = req.query.perPage ? Number(req.query.perPage) : 50;

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return res.status(400).json({ error: 'Valid start and end timestamps are required.' });
    }
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 50) {
      return res.status(400).json({ error: 'Valid page and perPage (1-50) are required.' });
    }

    const data = await getAiringSchedule(Math.floor(start), Math.floor(end), page, perPage);
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch airing schedule.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'anilist',
      route: '/api/anime/schedule',
      statusCode: 502,
      message,
    });
    res.status(502).json({ error: message });
  }
});

router.get('/settings', async (_req, res) => {
  await ensureDefaultSeedData();
  const settings = await dbGet<SystemSettings>('system_settings', 'global');
  res.json({ settings });
});

router.get('/universe-config', async (_req, res) => {
  try {
    const config = await getHomepageUniverseConfig();
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load homepage config.' });
  }
});

router.get('/spotlight', async (req, res) => {
  try {
    const tz = typeof req.query.tz === 'string' && req.query.tz.trim() ? req.query.tz.trim() : 'UTC';
    const spotlight = await getAnimeOfTheDay(tz);
    res.json(spotlight);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to select Anime of the Day.',
    });
  }
});

router.get('/surprise', async (req, res) => {
  try {
    const rawExclude = typeof req.query.excludeGenres === 'string' ? req.query.excludeGenres : '';
    const excludeGenres = rawExclude
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const anime = await getSurpriseAnime(excludeGenres);
    res.json({ anime });
  } catch (err) {
    res.status(404).json({
      error: err instanceof Error ? err.message : 'Unable to find a matching surprise anime.',
    });
  }
});

router.get('/collections', async (_req, res) => {
  try {
    const collections = await listCuratedCollections({ hydrateItems: true });
    res.json({ collections });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load curated collections.',
    });
  }
});

router.get('/characters', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(20, Math.max(1, Number(req.query.perPage || 10)));
    const data = await getCharacterSpotlights(page, perPage);
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load character spotlights.',
    });
  }
});

router.get('/faceoff', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const matchup = await getActiveFaceOff(req.authUser?.id || null);
    res.json({ matchup });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to load Anime Face-Off matchup.',
    });
  }
});

router.get('/universal-search', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '';
    const result = await universalSearch(query);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Universal search failed.',
    });
  }
});

router.get('/:id/episodes', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid AniList anime ID.' });
    }
    const refresh = req.query.refresh === '1';
    const result = await discoverAnimeEpisodes(id, { refresh });
    res.json(result);
  } catch (err) {
    if (err instanceof HttpRequestError && err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Failed to discover episodes.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'episodes',
      route: `/api/anime/${req.params.id}/episodes`,
      statusCode: 502,
      message,
    });
    res.status(502).json({ error: message });
  }
});

router.get('/:id/episode/:episodeNumber/sources', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const episodeNumber = Number(req.params.episodeNumber);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid AniList anime ID.' });
    }
    if (!Number.isFinite(episodeNumber) || episodeNumber < 0) {
      return res.status(400).json({ error: 'Valid non-negative episode number is required.' });
    }

    const lang = req.query.lang === 'dub' ? 'dub' : 'sub';
    const provider =
      typeof req.query.provider === 'string' ? req.query.provider.trim().toLowerCase() : undefined;
    const autoPlay = req.query.autoPlay === '1';
    const startSec = Number(req.query.start || 0);
    const refresh = req.query.refresh === '1';

    const result = await resolveEpisodeSources(id, episodeNumber, {
      lang,
      provider,
      autoPlay,
      startSec: Number.isFinite(startSec) ? Math.max(0, startSec) : 0,
      refresh,
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve episode sources.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'streaming',
      route: `/api/anime/${req.params.id}/episode/${req.params.episodeNumber}/sources`,
      statusCode: 502,
      message,
    });
    res.status(502).json({ error: message });
  }
});

router.get('/:id/health', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid AniList anime ID.' });
    }
    const health = await getAnimeStreamingHealth(id);
    res.json(health);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check anime streaming health.';
    res.status(502).json({ error: message });
  }
});

router.get('/resolve-ids', async (req, res) => {
  try {
    const rawAni = req.query.anilistId !== undefined ? Number(req.query.anilistId) : undefined;
    const rawMal = req.query.malId !== undefined ? Number(req.query.malId) : undefined;

    const validAni = rawAni !== undefined && Number.isInteger(rawAni) && rawAni > 0 ? rawAni : undefined;
    const validMal = rawMal !== undefined && Number.isInteger(rawMal) && rawMal > 0 ? rawMal : undefined;

    if ((rawAni !== undefined && !validAni) || (rawMal !== undefined && !validMal) || (!validAni && !validMal)) {
      return res.status(400).json({ error: 'Provide a valid positive integer anilistId or malId.' });
    }

    const mapping = await resolveAnimeIds({ anilistId: validAni, malId: validMal });
    if (!mapping) {
      return res.status(404).json({ error: 'Anime ID mapping not found on AniList.' });
    }

    return res.json({ mapping });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve AniList and MAL IDs.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'anilist',
      route: '/api/anime/resolve-ids',
      statusCode: 502,
      message,
    });
    return res.status(502).json({ error: message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid anime ID.' });
    }

    const { anime, meta } = await getAnimeDetailsWithMeta(id);
    if (!anime) {
      return res.status(404).json({ error: 'Anime not found on AniList.' });
    }

    // Never allow Jikan rate-limiting/queueing to block AniList details past 4.5 seconds
    const malPromise = getMalAnimeInfoWithMeta(anime.idMal);
    const malRes = await Promise.race([
      malPromise,
      new Promise<{
        info: null;
        meta: { status: 'unavailable'; fetchedAt: string; error: string };
      }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              info: null,
              meta: {
                status: 'unavailable',
                fetchedAt: new Date().toISOString(),
                error: 'MyAnimeList enrichment timed out; cached data will update in background.',
              },
            }),
          4500
        )
      ),
    ]);

    res.json({
      anime,
      _meta: meta,
      malInfo: malRes.info,
      malMeta: malRes.meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch anime details.';
    await logAppError({
      requestId: (req as any).requestId,
      source: 'anilist',
      route: `/api/anime/${req.params.id}`,
      statusCode: 502,
      message,
    });
    res.status(502).json({ error: message });
  }
});

export default router;
